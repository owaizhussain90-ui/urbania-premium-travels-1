// Supabase Edge Function: send-sms
// Wire it up with a Database Webhook: table `notifications`, event INSERT -> this function.
// Secrets: SMS_PROVIDER (msg91|twilio), MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, WEBHOOK_SECRET
// Deploy: supabase functions deploy send-sms --no-verify-jwt   (auth is the shared secret header below)

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { record } = await req.json();
  const phone: string | undefined = record?.phone;
  if (!phone) return new Response('No phone', { status: 200 });
  const to = phone.replace(/[^0-9]/g, '').replace(/^0+/, '');
  const e164 = to.length === 10 ? `91${to}` : to;
  const text = `Urbania Premium Travels: ${record.body}`.slice(0, 300);

  try {
    if (Deno.env.get('SMS_PROVIDER') === 'twilio') {
      const sid = Deno.env.get('TWILIO_SID')!;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${sid}:${Deno.env.get('TWILIO_TOKEN')}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `+${e164}`, From: Deno.env.get('TWILIO_FROM')!, Body: text }),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { authkey: Deno.env.get('MSG91_AUTH_KEY')!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: Deno.env.get('MSG91_TEMPLATE_ID'),
          recipients: [{ mobiles: e164, message: text }],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    }
    return new Response('sent');
  } catch (e) {
    console.error('SMS failed', e);
    return new Response('SMS failed', { status: 500 });
  }
});
