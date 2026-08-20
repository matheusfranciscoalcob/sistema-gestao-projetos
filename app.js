import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const SUPABASE_URL = "https://uspndiasqerdypsfqofl.supabase.co";
const SUPABASE_KEY = "sb_publishable_pakYKjwYUZ5VbmEMV6k-vQ_mNw-Caik";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (selector) => document.querySelector(selector);
const state = { session: null, profile: null, projects: [], logs: [], attachments: [], calendarDate: new Date(), openId: null };
const labels = {
  engineering: "Gestor de Engenharia", production: "Gestor de Produção", designer: "Projetista",
  maintenance: "Manutenção · visualização", director: "Diretoria · visualização"
};
const stageLabels = { pending_approval: "Aguardando aprovação", awaiting_estimate: "Aguardando estimativa", workflow: "Em fluxo", rejected: "Recusado" };
const canManage = () => ["engineering", "production", "designer"].includes(state.profile?.role);
const isManager = () => ["engineering", "production"].includes(state.profile?.role);
const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
const isoToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const formatDate = (date) => date ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T12:00:00`)) : "—";
const formatDateTime = (date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));

function toast(message, error = false) {
  const el = $("#toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "toast", 3200);
}
function setBusy(button, busy, text = "Aguarde…") {
  if (!button) return; if (busy) { button.dataset.label = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}
function dueState(project) {
  const days = Math.ceil((new Date(`${project.due_date}T23:59:59`) - new Date()) / 86400000);
  return days < 0 ? `${Math.abs(days)}d atrasado` : days === 0 ? "Vence hoje" : `${days}d restantes`;
}

async function submitRequest(form, dialog = null) {
  const button = form.querySelector('[type="submit"], button[value="default"]'); setBusy(button, true, "Enviando…");
  const data = Object.fromEntries(new FormData(form));
  const { error } = await supabase.rpc("fluxo_submit_request", {
    p_title: data.title, p_requester: data.requester || "", p_area: data.area || "", p_description: data.description,
    p_impact: data.impact || "", p_priority: data.priority, p_due_date: data.due_date
  });
  setBusy(button, false);
  if (error) return toast(error.message, true);
  form.reset(); form.querySelector('[name="priority"]').value = "Média";
  if (dialog) dialog.close();
  toast(state.session ? "Projeto criado e enviado ao projetista." : "Solicitação enviada para revisão.");
  if (state.session) await loadData();
}

async function loadData() {
  const [{ data: projects, error }, { data: logs }, { data: attachments }] = await Promise.all([
    supabase.from("fluxo_projects").select("*").order("position").order("created_at"),
    supabase.from("fluxo_logs").select("*").order("created_at", { ascending: false }),
    supabase.from("fluxo_attachments").select("*").order("created_at", { ascending: false })
  ]);
  if (error) return toast("Não foi possível atualizar os projetos.", true);
  state.projects = projects || []; state.logs = logs || []; state.attachments = attachments || [];
  render();
}

function render() {
  const projects = filteredProjects();
  const counts = {
    pending: state.projects.filter(p => p.stage === "pending_approval").length,
    estimate: state.projects.filter(p => p.stage === "awaiting_estimate").length,
    active: state.projects.filter(p => p.stage === "workflow" && p.status !== "Concluído").length,
    late: state.projects.filter(p => p.stage === "workflow" && p.status !== "Concluído" && new Date(`${p.due_date}T23:59:59`) < new Date()).length
  };
  $("#stats").innerHTML = [["Aguardando aprovação",counts.pending],["Sem estimativa",counts.estimate],["Em andamento",counts.active],["Em atraso",counts.late]].map(([l,n]) => `<div class="stat"><span>${l}</span><b>${n}</b></div>`).join("");
  const needs = state.profile?.role === "designer" ? counts.estimate : isManager() ? counts.pending : 0;
  $("#alertBox").classList.toggle("hidden", !needs);
  $("#alertBox").innerHTML = needs ? `<b>${needs} ${needs === 1 ? "projeto precisa" : "projetos precisam"} da sua atenção.</b> ${state.profile.role === "designer" ? "Informe as horas previstas para liberar no fluxo." : "Abra e revise as informações antes da aprovação."}` : "";
  $("#dragHint").classList.toggle("hidden", !canManage());
  $("#projectList").innerHTML = projects.length ? projects.map(cardTemplate).join("") : `<div class="empty"><b>Nenhum projeto encontrado.</b><br>O sistema está pronto para receber novas solicitações.</div>`;
  document.querySelectorAll(".open-project").forEach(btn => btn.onclick = () => openProject(Number(btn.dataset.id)));
  setupDragging(); renderCalendar();
}
function filteredProjects() {
  const query = $("#searchInput").value.trim().toLowerCase(), stage = $("#stageFilter").value;
  return state.projects.filter(p => (!stage || p.stage === stage) && (!query || [p.title,p.requester,p.area].join(" ").toLowerCase().includes(query)));
}
function cardTemplate(p) {
  const priorityClass = p.priority === "Crítica" ? "critical" : p.priority === "Alta" ? "high" : "";
  return `<article class="project-card" draggable="${canManage() && p.stage === "workflow"}" data-id="${p.id}">
    <div class="drag-handle">${canManage() && p.stage === "workflow" ? "⠿" : "·"}</div>
    <div class="project-main"><h3>${esc(p.title)}</h3><p>${esc(p.requester || "Solicitante não informado")}${p.area ? ` · ${esc(p.area)}` : ""}</p></div>
    <div class="meta"><span>Etapa</span><b>${esc(stageLabels[p.stage])}</b></div>
    <div class="meta optional-meta"><span>Prazo</span><b>${formatDate(p.due_date)}</b><span>${dueState(p)}</span></div>
    <span class="pill ${priorityClass}">${esc(p.priority)}</span>
    <button class="open-project" data-id="${p.id}" aria-label="Abrir projeto">→</button>
  </article>`;
}

function setupDragging() {
  let dragged = null;
  document.querySelectorAll('.project-card[draggable="true"]').forEach(card => {
    card.ondragstart = () => { dragged = card; card.classList.add("dragging"); };
    card.ondragend = async () => { card.classList.remove("dragging"); if (!dragged) return; dragged = null; await saveOrder(); };
    card.ondragover = e => { e.preventDefault(); if (!dragged || card === dragged) return; const box = card.getBoundingClientRect(); card.parentNode.insertBefore(dragged, e.clientY < box.top + box.height / 2 ? card : card.nextSibling); };
  });
}
async function saveOrder() {
  const ids = [...document.querySelectorAll('.project-card[draggable="true"]')].map(el => Number(el.dataset.id));
  const results = await Promise.all(ids.map((id, index) => supabase.from("fluxo_projects").update({ position: index + 1 }).eq("id", id)));
  if (results.some(r => r.error)) toast("Não foi possível salvar a nova ordem.", true); else toast("Ordem de prioridade atualizada.");
  await loadData();
}

function field(label, name, value, type = "text", options = "", disabled = false) {
  if (type === "textarea") return `<label class="span-2">${label}<textarea name="${name}" rows="3" ${disabled ? "disabled" : ""}>${esc(value)}</textarea></label>`;
  if (type === "select") return `<label>${label}<select name="${name}" ${disabled ? "disabled" : ""}>${options}</select></label>`;
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value ?? "")}" ${disabled ? "disabled" : ""}></label>`;
}
function openProject(id) {
  const p = state.projects.find(item => item.id === id); if (!p) return;
  state.openId = id; const editableReview = isManager() && p.stage === "pending_approval";
  const readOnly = !editableReview;
  $("#projectModalOverline").textContent = stageLabels[p.stage]; $("#projectModalTitle").textContent = p.title;
  $("#projectFields").innerHTML = field("Título", "title", p.title, "text", "", readOnly) + field("Solicitante", "requester", p.requester, "text", "", readOnly) + field("Área", "area", p.area, "text", "", readOnly) + field("Descrição", "description", p.description, "textarea", "", readOnly) + field("Impacto", "impact", p.impact, "textarea", "", readOnly) + field("Prioridade", "priority", p.priority, "select", ["Baixa","Média","Alta","Crítica"].map(v => `<option ${v===p.priority?"selected":""}>${v}</option>`).join(""), readOnly) + field("Prazo previsto", "due_date", p.due_date, "date", "", readOnly);
  $("#projectSaveBtn").classList.toggle("hidden", !editableReview);
  $("#projectSaveBtn").textContent = "Revisar e aprovar";
  $("#projectExtra").innerHTML = extrasTemplate(p);
  wireExtras(p); $("#projectDialog").showModal();
}
function extrasTemplate(p) {
  const projectLogs = state.logs.filter(l => l.project_id === p.id), files = state.attachments.filter(a => a.project_id === p.id);
  const designerEstimate = state.profile.role === "designer" && p.stage === "awaiting_estimate" ? `<div class="detail-block"><h3>Estimativa do projetista</h3><form id="estimateForm" class="inline-form"><input name="hours" type="number" min="1" required placeholder="Horas previstas"><button class="button primary">Liberar no fluxo</button></form></div>` : "";
  const statusControl = canManage() && p.stage === "workflow" ? `<div class="detail-block"><h3>Andamento</h3><form id="statusForm" class="form-grid"><label>Status<select name="status">${["Aprovado","Em desenvolvimento","Aguardando informações","Em validação","Concluído"].map(v=>`<option ${v===p.status?"selected":""}>${v}</option>`).join("")}</select></label><label>Progresso (%)<input name="progress" type="number" min="0" max="100" value="${p.progress}"></label><div class="span-2"><button class="button ghost">Atualizar andamento</button></div></form></div>` : "";
  const logForm = state.profile.role === "designer" ? `<form id="logForm" class="inline-form"><input name="message" maxlength="1000" required placeholder="Informação aguardada ou próxima etapa"><button class="button primary">Adicionar</button></form>` : "";
  const attachmentForm = canManage() ? `<form id="attachmentForm" class="inline-form"><input name="file" type="file" accept="application/pdf,.pdf" required><button class="button ghost">Anexar PDF</button></form>` : "";
  return `<div class="detail-block"><h3>Planejamento</h3><p><b>${p.estimated_hours ? `${p.estimated_hours} hora(s) previstas` : "Horas ainda não informadas"}</b> · ${esc(p.status)} · ${p.progress}%</p></div>${designerEstimate}${statusControl}<div class="detail-block"><h3>Acompanhamento</h3>${logForm}<div class="log-list">${projectLogs.length ? projectLogs.map(l=>`<div class="log-item">${esc(l.message)}<small>${esc(l.author_name)} · ${formatDateTime(l.created_at)}</small></div>`).join("") : `<small>Nenhum registro de acompanhamento.</small>`}</div></div><div class="detail-block"><h3>Arquivos PDF</h3>${attachmentForm}<div class="attachment-list">${files.length ? files.map(a=>`<button type="button" class="attachment-item open-file" data-path="${esc(a.object_path)}">📄 ${esc(a.file_name)}</button>`).join("") : `<small>Nenhum arquivo anexado.</small>`}</div></div>`;
}
function wireExtras(p) {
  $("#estimateForm")?.addEventListener("submit", async e => { e.preventDefault(); const hours=Number(new FormData(e.currentTarget).get("hours")); const {error}=await supabase.from("fluxo_projects").update({estimated_hours:hours,stage:"workflow"}).eq("id",p.id); if(error)return toast(error.message,true); toast("Estimativa registrada e projeto liberado."); $("#projectDialog").close(); await loadData(); });
  $("#statusForm")?.addEventListener("submit", async e => { e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget)); const progress=Number(d.progress); const {error}=await supabase.from("fluxo_projects").update({status:d.status,progress:d.status==="Concluído"?100:progress}).eq("id",p.id); if(error)return toast(error.message,true); toast("Andamento atualizado."); $("#projectDialog").close(); await loadData(); });
  $("#logForm")?.addEventListener("submit", async e => { e.preventDefault(); const message=new FormData(e.currentTarget).get("message"); const {error}=await supabase.from("fluxo_logs").insert({project_id:p.id,message,author_id:state.session.user.id,author_name:state.profile.display_name}); if(error)return toast(error.message,true); toast("Registro adicionado."); await loadData(); openProject(p.id); });
  $("#attachmentForm")?.addEventListener("submit", async e => { e.preventDefault(); const file=new FormData(e.currentTarget).get("file"); if(!file||file.type!=="application/pdf")return toast("Selecione um arquivo PDF.",true); if(file.size>8388608)return toast("O PDF deve ter no máximo 8 MB.",true); const path=`${p.id}/${crypto.randomUUID()}.pdf`; const upload=await supabase.storage.from("fluxo-project-pdfs").upload(path,file,{contentType:"application/pdf"}); if(upload.error)return toast(upload.error.message,true); const meta=await supabase.from("fluxo_attachments").insert({project_id:p.id,object_path:path,file_name:file.name,size_bytes:file.size,uploaded_by:state.session.user.id}); if(meta.error){await supabase.storage.from("fluxo-project-pdfs").remove([path]);return toast(meta.error.message,true)} toast("PDF anexado."); await loadData(); openProject(p.id); });
  document.querySelectorAll(".open-file").forEach(btn=>btn.onclick=async()=>{const {data,error}=await supabase.storage.from("fluxo-project-pdfs").createSignedUrl(btn.dataset.path,120);if(error)return toast(error.message,true);window.open(data.signedUrl,"_blank","noopener")});
}

function renderCalendar() {
  const date = state.calendarDate, year = date.getFullYear(), month = date.getMonth();
  $("#calendarTitle").textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay());
  const cells=[]; for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");const items=state.projects.filter(p=>p.due_date===iso&&p.stage!=="rejected");cells.push(`<div class="day ${d.getMonth()!==month?"muted":""}"><b>${d.getDate()}</b>${items.map(p=>`<button class="calendar-project open-project" data-id="${p.id}" title="${esc(p.title)}">${esc(p.title)}</button>`).join("")}</div>`)}
  $("#calendarGrid").innerHTML=cells.join(""); document.querySelectorAll("#calendarGrid .open-project").forEach(btn=>btn.onclick=()=>openProject(Number(btn.dataset.id)));
}

async function establishSession(session) {
  state.session = session;
  if (!session) { state.profile=null; $("#publicView").classList.remove("hidden"); $("#appView").classList.add("hidden"); $("#loginBtn").classList.remove("hidden"); $("#logoutBtn").classList.add("hidden"); $("#userBadge").classList.add("hidden"); return; }
  const {data,error}=await supabase.from("fluxo_profiles").select("*").eq("user_id",session.user.id).single();
  if(error||!data){await supabase.auth.signOut();return toast("Este usuário não possui acesso ao sistema.",true)}
  state.profile=data; $("#publicView").classList.add("hidden"); $("#appView").classList.remove("hidden"); $("#loginBtn").classList.add("hidden"); $("#logoutBtn").classList.remove("hidden"); $("#userBadge").classList.remove("hidden"); $("#userBadge").textContent=data.display_name; $("#roleTitle").textContent=labels[data.role]; $("#newInternalBtn").classList.toggle("hidden",!["engineering","production","designer"].includes(data.role));
  await loadData();
}

$("#requestForm").addEventListener("submit", e => { e.preventDefault(); submitRequest(e.currentTarget); });
$("#internalForm").addEventListener("submit", e => { e.preventDefault(); submitRequest(e.currentTarget, $("#newDialog")); });
$("#loginBtn").onclick=()=>$("#loginDialog").showModal();
$("#logoutBtn").onclick=async()=>{await supabase.auth.signOut();toast("Sessão encerrada.")};
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();const button=e.currentTarget.querySelector('.primary');setBusy(button,true,"Entrando…");const d=Object.fromEntries(new FormData(e.currentTarget));const username=d.username.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");const {error}=await supabase.auth.signInWithPassword({email:`${username}@fluxo.local`,password:d.password});setBusy(button,false);if(error)return toast("Usuário ou senha inválidos.",true);e.currentTarget.reset();$("#loginDialog").close()});
$("#projectForm").addEventListener("submit",async e=>{e.preventDefault();const p=state.projects.find(x=>x.id===state.openId);if(!p||!isManager()||p.stage!=="pending_approval")return;const button=$("#projectSaveBtn");setBusy(button,true,"Aprovando…");const d=Object.fromEntries(new FormData(e.currentTarget));const {error}=await supabase.from("fluxo_projects").update({title:d.title,requester:d.requester,area:d.area,description:d.description,impact:d.impact,priority:d.priority,due_date:d.due_date,stage:"awaiting_estimate"}).eq("id",p.id);setBusy(button,false);if(error)return toast(error.message,true);toast("Informações revisadas. Projeto enviado ao projetista.");$("#projectDialog").close();await loadData()});
$("#newInternalBtn").onclick=()=>$("#newDialog").showModal(); $("#refreshBtn").onclick=loadData;
$("#searchInput").oninput=render; $("#stageFilter").onchange=render;
document.querySelectorAll(".nav-item[data-view]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b===btn));const calendar=btn.dataset.view==="calendar";$("#dashboardView").classList.toggle("hidden",calendar);$("#calendarView").classList.toggle("hidden",!calendar);$("#stats").classList.toggle("hidden",calendar);$("#pageTitle").textContent=calendar?"Calendário de vencimentos":"Painel de projetos";$("#pageSubtitle").textContent=calendar?"Projetos organizados pela data de entrega.":"Uma visão clara do trabalho em andamento.";});
$("#prevMonth").onclick=()=>{state.calendarDate=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth()-1,1);renderCalendar()};
$("#nextMonth").onclick=()=>{state.calendarDate=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth()+1,1);renderCalendar()};
document.querySelectorAll('input[type="date"]').forEach(input=>input.min=isoToday());

supabase.auth.onAuthStateChange((_event,session)=>setTimeout(()=>establishSession(session),0));
const {data:{session}}=await supabase.auth.getSession(); await establishSession(session);
