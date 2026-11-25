import { accessGuestInvitation } from "@/lib/data/event-guest-invitations";
import { formatGuestInvitationWhen, guestResponseLabel, isGuestResponse } from "@/lib/event-guest-invitation";
import { eventCalendarResponse } from "@/lib/event-ics";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
};

export function guestInvitationPage() {
    return new Response(
        `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Event invitation · Kamooni</title>
  <style>
    body { background: #f6f7f5; color: #18271f; font: 1rem/1.55 system-ui, sans-serif; margin: 0; }
    main { background: white; border: 1px solid #d9e0da; border-radius: 12px; box-sizing: border-box;
           margin: 8vh auto; padding: clamp(1.25rem, 5vw, 2.5rem); width: min(90%, 36rem); overflow-wrap: anywhere; }
    h1 { line-height: 1.15; } p { margin-block: .65rem; }
    button { background: white; border: 1px solid #597261; border-radius: 6px; color: inherit; cursor: pointer;
             font: inherit; margin: .25rem .25rem .25rem 0; padding: .45rem .75rem; }
    button[aria-pressed=true] { background: #28573e; color: white; }
    button:disabled { cursor: wait; } fieldset { border: 0; margin: 1rem 0 .5rem; padding: 0; }
    legend { font-weight: 600; } a { color: #28573e; }
  </style>
</head>
<body>
  <main>
    <h1 id="title">Event invitation</h1>
    <section id="invitation" hidden>
      <p id="when"></p>
      <p id="location"></p>
      <a id="meeting" rel="noreferrer" hidden>Open meeting link</a>
      <p id="description"></p>
      <fieldset id="responses">
        <legend>Your response</legend>
        <button type="button" value="going" aria-pressed="false">${guestResponseLabel.going}</button>
        <button type="button" value="interested" aria-pressed="false">${guestResponseLabel.interested}</button>
        <button type="button" value="declined" aria-pressed="false">${guestResponseLabel.declined}</button>
      </fieldset>
      <button type="button" id="download">Download calendar file (.ics)</button>
    </section>
    <p id="status" role="status">Loading invitation…</p>
    <noscript>Enable JavaScript to open this invitation and respond.</noscript>
  </main>
  <script>
    const token = location.hash.slice(1);
    const invitation = document.getElementById('invitation');
    const status = document.getElementById('status');
    const responses = document.getElementById('responses');
    const download = document.getElementById('download');

    async function request(operation, response) {
      const result = await fetch(location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ token, operation, response }),
      });
      if (result.status === 404) {
        invitation.hidden = true;
        document.getElementById('title').textContent = 'Event invitation';
        status.textContent = 'This invitation is unavailable.';
        return null;
      }
      if (!result.ok) throw new Error('Request failed');
      return result;
    }

    function showResponse(data, saved) {
      for (const button of responses.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.value === data.status));
      }
      status.textContent = saved ? 'Response saved. You can change it here.' : '';
    }

    async function downloadCalendar() {
      download.disabled = true;
      try {
        const result = await request('calendar');
        if (!result) return;
        const objectUrl = URL.createObjectURL(await result.blob());
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'event.ics';
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch {
        status.textContent = 'Could not download the calendar file. Please try again.';
      } finally {
        download.disabled = false;
      }
    }

    async function openInvitation() {
      if (!/^[a-f0-9]{64}$/.test(token)) {
        status.textContent = 'This invitation is unavailable.';
        return;
      }
      try {
        const result = await request('view');
        if (!result) return;
        const data = await result.json();
        for (const field of ['title', 'when', 'location', 'description']) {
          document.getElementById(field).textContent = data[field];
        }
        if (data.meetingUrl) {
          const meeting = document.getElementById('meeting');
          meeting.href = data.meetingUrl;
          meeting.hidden = false;
        }
        invitation.hidden = false;
        showResponse(data, false);
        if (new URLSearchParams(location.search).get('download') === 'ics') await downloadCalendar();
      } catch {
        status.textContent = 'Could not open the invitation. Please try again.';
      }
    }

    responses.addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      if (!button || responses.disabled) return;
      responses.disabled = true;
      try {
        const result = await request('rsvp', button.value);
        if (result) showResponse(await result.json(), true);
      } catch {
        status.textContent = 'Could not save your response. Please try again.';
      } finally {
        responses.disabled = false;
      }
    });
    download.addEventListener('click', downloadCalendar);
    void openInvitation();
  </script>
</body>
</html>`,
        { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
    );
}

export async function handleGuestInvitationRequest(request: Request, access = accessGuestInvitation) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0];
    if (contentType !== "application/json") return new Response(null, { status: 415, headers });
    const body = await readJsonBodyLimited(request, 1024);
    if (!body.ok) return new Response(null, { status: body.status, headers });
    const { token, operation, response } = (body.value ?? {}) as Record<string, unknown>;
    if (typeof token !== "string") return new Response(null, { status: 404, headers });
    if (operation !== "view" && operation !== "rsvp" && operation !== "calendar") {
        return new Response(null, { status: 400, headers });
    }
    if (operation === "rsvp" && !isGuestResponse(response)) return new Response(null, { status: 400, headers });

    try {
        const invitation = await access(
            token,
            operation === "rsvp" && isGuestResponse(response) ? response : undefined,
        );
        if (!invitation) return new Response(null, { status: 404, headers });
        const { details, schedule, status, calendarId } = invitation;
        if (operation === "calendar") {
            const calendar = eventCalendarResponse({
                ...schedule,
                title: details.title,
                description: [details.description, details.meetingUrl].filter(Boolean).join("\n\n"),
                location: details.location,
                uid: `guest-event-${calendarId}@${new URL(process.env.CIRCLES_URL || request.url).hostname}`,
            });
            for (const [key, value] of Object.entries(headers)) calendar.headers.set(key, value);
            return calendar;
        }
        return Response.json(
            {
                title: details.title,
                description: details.description,
                location: details.location,
                meetingUrl: details.meetingUrl,
                when: formatGuestInvitationWhen(schedule.startAt, schedule.endAt, schedule.allDay),
                status,
            },
            { headers },
        );
    } catch {
        return new Response(null, { status: 503, headers });
    }
}
