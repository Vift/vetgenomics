const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PIPELINE_NAME = "Сайт";
const STATUS_NAME = "Поступила заявка с сайта";

let stageCache = null;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS)
  });
}

async function resolveStage(base, auth) {
  if (stageCache) return stageCache;
  const res = await fetch(base + "/leads/pipelines", { headers: auth });
  if (!res.ok) return null;
  const data = await res.json();
  const pipelines = (data && data._embedded && data._embedded.pipelines) || [];
  const pipeline = pipelines.find(function (p) { return p.name === PIPELINE_NAME; });
  if (!pipeline) return null;
  const statuses = (pipeline._embedded && pipeline._embedded.statuses) || [];
  const status = statuses.find(function (s) { return s.name === STATUS_NAME; });
  stageCache = {
    pipeline_id: pipeline.id,
    status_id: status ? status.id : null
  };
  return stageCache;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    let data = null;
    try { data = await request.json(); } catch (e) {}

    const name = ((data && data.name) || "").toString().trim().slice(0, 100);
    const phone = ((data && data.phone) || "").toString().trim().slice(0, 32);
    const email = ((data && data.email) || "").toString().trim().slice(0, 120);
    const comment = ((data && data.comment) || "").toString().trim().slice(0, 4000);
    const source = ((data && data.source) || "").toString().trim().slice(0, 60);

    if (name.length < 2 || phone.replace(/\D/g, "").length < 10) return json({ error: "Invalid payload" }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);
    if (!env.AMO_TOKEN || !env.AMO_DOMAIN) return json({ error: "Server is not configured" }, 500);

    const base = "https://" + env.AMO_DOMAIN + ".amocrm.ru/api/v4";
    const auth = { "Authorization": "Bearer " + env.AMO_TOKEN, "Content-Type": "application/json" };

    const contactPayload = {
      first_name: name,
      custom_fields_values: [{ field_code: "PHONE", values: [{ value: phone }] }]
    };
    if (email) contactPayload.custom_fields_values.push({ field_code: "EMAIL", values: [{ value: email }] });

    const contactRes = await fetch(base + "/contacts", {
      method: "POST",
      headers: auth,
      body: JSON.stringify([contactPayload])
    });
    if (!contactRes.ok) {
      const detail = await contactRes.text();
      return json({ error: "amoCRM error", stage: "contact", status: contactRes.status, detail: detail.slice(0, 500) }, 502);
    }
    const contactData = await contactRes.json();
    const createdContact = contactData && contactData._embedded && contactData._embedded.contacts && contactData._embedded.contacts[0];
    const contactId = createdContact && createdContact.id;

    const lead = {
      name: (source || "Заявка с сайта") + " — " + name,
      _embedded: { contacts: contactId ? [{ id: contactId }] : [] }
    };

    const stage = await resolveStage(base, auth).catch(function () { return null; });
    if (stage) {
      lead.pipeline_id = stage.pipeline_id;
      if (stage.status_id) lead.status_id = stage.status_id;
    }

    const res = await fetch(base + "/leads", {
      method: "POST",
      headers: auth,
      body: JSON.stringify([lead])
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "amoCRM error", stage: "lead", status: res.status, detail: detail.slice(0, 500) }, 502);
    }

    const created = await res.json();
    const createdLead = created && created._embedded && created._embedded.leads && created._embedded.leads[0];
    const leadId = createdLead && createdLead.id;

    if (comment && leadId) {
      await fetch(base + "/leads/" + leadId + "/notes", {
        method: "POST",
        headers: auth,
        body: JSON.stringify([{ note_type: "common", params: { text: comment } }])
      }).catch(function () {});
    }

    return json({ ok: true, lead_id: leadId || null });
  }
};
