/* TRANSALMA - Archivo histórico en Google Drive.
 * Copia PDFs, fotografías, firmas y metadatos por lotes.
 * No elimina ni modifica archivos de Supabase.
 */
(() => {
  const cfg = window.TRANSALMA_CONFIG || {};
  const sup = window.TRANSALMA_SUPABASE;
  const $ = id => document.getElementById(id);
  const CLIENT_ID = cfg.GOOGLE_OAUTH_CLIENT_ID;
  const PROJECT_NUMBER = cfg.GOOGLE_CLOUD_PROJECT_NUMBER;
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  let apiKey = "";
  let accessToken = "";
  let selectedRoot = null;
  let tokenClient = null;
  let pickerReady = false;

  const status = text => { if ($("driveArchiveStatus")) $("driveArchiveStatus").textContent = text || ""; };
  const progress = (done,total) => {
    const el = $("driveArchiveProgress");
    if (el) { el.max = Math.max(1,total); el.value = done; }
  };

  function loadScript(src) {
    return new Promise((resolve,reject) => {
      const existing = [...document.scripts].find(s => s.src === src);
      if (existing) { resolve(); return; }
      const script = document.createElement("script");
      script.src = src; script.async = true;
      script.onload = resolve; script.onerror = () => reject(new Error("No se pudo cargar el componente de Google."));
      document.head.appendChild(script);
    });
  }

  async function loadGoogleLibraries() {
    await loadScript("https://accounts.google.com/gsi/client");
    await loadScript("https://apis.google.com/js/api.js");
    await new Promise((resolve,reject) => {
      if (window.gapi?.load) window.gapi.load("picker", { callback: resolve, onerror: reject });
      else reject(new Error("Google Picker no está disponible."));
    });
    pickerReady = true;
  }

  function authorize() {
    return new Promise(async (resolve,reject) => {
      try {
        if (!CLIENT_ID || !PROJECT_NUMBER) throw new Error("Falta configurar el Client ID o el número del proyecto.");
        await loadGoogleLibraries();
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: response => {
            if (response.error) return reject(new Error(response.error_description || response.error));
            accessToken = response.access_token;
            resolve(accessToken);
          },
          error_callback: error => reject(new Error(error.message || "No se pudo autorizar Google Drive."))
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      } catch (error) { reject(error); }
    });
  }

  function chooseRootFolder() {
    return new Promise((resolve,reject) => {
      if (!pickerReady || !accessToken || !apiKey) return reject(new Error("Primero autoriza Google y registra la clave API."));
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);
      const picker = new google.picker.PickerBuilder()
        .setAppId(PROJECT_NUMBER)
        .setDeveloperKey(apiKey)
        .setOAuthToken(accessToken)
        .addView(view)
        .setTitle("Selecciona TRANSALMA_REPORTES_ARCHIVO")
        .setCallback(data => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (!doc?.id) return reject(new Error("No se pudo identificar la carpeta seleccionada."));
            resolve({ id: doc.id, name: doc.name });
          } else if (data.action === google.picker.Action.CANCEL) reject(new Error("Selección cancelada."));
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function driveRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Google Drive respondió ${response.status}: ${detail.slice(0,350)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function escapeDriveQuery(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function findChild(parentId, name) {
    const q = `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and trashed = false`;
    const url = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) +
      "&fields=" + encodeURIComponent("files(id,name,mimeType)") + "&pageSize=100";
    const data = await driveRequest(url);
    return (data.files || []).find(file => file.name === name) || null;
  }

  async function ensureFolder(parentId, name) {
    const existing = await findChild(parentId, name);
    if (existing) return existing.id;
    const created = await driveRequest("https://www.googleapis.com/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] })
    });
    return created.id;
  }

  async function uploadBlob(parentId, name, blob, mimeType) {
    const existing = await findChild(parentId, name);
    if (existing) return { id: existing.id, skipped: true };
    const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType || "application/octet-stream",
        "X-Upload-Content-Length": String(blob.size)
      },
      body: JSON.stringify({ name, mimeType: mimeType || "application/octet-stream", parents: [parentId] })
    });
    if (!start.ok) throw new Error(`No se pudo iniciar la copia de ${name} (HTTP ${start.status}).`);
    const uploadUrl = start.headers.get("Location");
    if (!uploadUrl) throw new Error("Google no devolvió la dirección de carga.");
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": mimeType || "application/octet-stream" },
      body: blob
    });
    if (!uploaded.ok) {
      const detail = await uploaded.text().catch(() => "");
      throw new Error(`Falló la carga de ${name}: HTTP ${uploaded.status} ${detail.slice(0,250)}`);
    }
    return { ...(await uploaded.json()), skipped: false };
  }

  function sequenceNumber(report) {
    const match = String(report.report_number || "").match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }
  function lotName(report) {
    const n = sequenceNumber(report);
    if (!n || !Number.isFinite(n)) return "LOTE_SIN_NUMERO";
    const start = Math.floor((n - 1) / 10) * 10 + 1;
    const end = start + 9;
    return `LOTE_${String(start).padStart(3,"0")}_AL_${String(end).padStart(3,"0")}`;
  }
  function safeName(value) {
    return String(value || "archivo").replace(/[\\/:*?"<>|]/g,"_");
  }

  async function downloadStorage(bucket, path) {
    const { data, error } = await sup.storage.from(bucket).download(path);
    if (error) throw new Error(`No se pudo descargar ${bucket}/${path}: ${error.message}`);
    return data;
  }

  async function fetchRows() {
    const reportsResult = await sup.from("reports").select("*").order("created_at", { ascending: true });
    if (reportsResult.error) throw reportsResult.error;
    const photosResult = await sup.from("report_photos").select("*");
    if (photosResult.error) throw photosResult.error;
    const signaturesResult = await sup.from("report_signatures").select("*");
    if (signaturesResult.error) throw signaturesResult.error;
    return { reports: reportsResult.data || [], photos: photosResult.data || [], signatures: signaturesResult.data || [] };
  }

  async function runArchive() {
    if (!sup) throw new Error("No se encontró la conexión de Supabase en esta sesión.");
    if (!accessToken || !selectedRoot) throw new Error("Primero conecta Google Drive y selecciona la carpeta raíz.");
    const { reports, photos, signatures } = await fetchRows();
    const tasks = reports.reduce((sum, report) => {
      return sum + (report.pdf_storage_path ? 1 : 0) +
        photos.filter(photo => photo.report_id === report.id).length +
        signatures.filter(signature => signature.report_id === report.id).length + 1;
    }, 0);
    let done = 0, copied = 0, skipped = 0, errors = [];
    progress(0,tasks);
    for (const report of reports) {
      try {
        const reportNo = safeName(report.report_number || report.id);
        const lotId = await ensureFolder(selectedRoot.id, lotName(report));
        const reportFolder = await ensureFolder(lotId, reportNo);
        const pdfFolder = await ensureFolder(reportFolder, "PDF_REPORTES");
        const photoFolder = await ensureFolder(reportFolder, "FOTOGRAFIAS");
        const signatureFolder = await ensureFolder(reportFolder, "FIRMAS");
        const reportPhotos = photos.filter(photo => photo.report_id === report.id);
        const reportSignatures = signatures.filter(signature => signature.report_id === report.id);

        if (report.pdf_storage_path) {
          try {
            const blob = await downloadStorage("report-pdfs", report.pdf_storage_path);
            const result = await uploadBlob(pdfFolder, `${reportNo}.pdf`, blob, "application/pdf");
            result.skipped ? skipped++ : copied++;
          } finally { done++; progress(done,tasks); }
        }

        for (let i=0;i<reportPhotos.length;i++) {
          const photo = reportPhotos[i];
          try {
            const blob = await downloadStorage("report-photos", photo.storage_path);
            const name = safeName(photo.original_name || `FOTO_${String(i+1).padStart(2,"0")}`);
            const result = await uploadBlob(photoFolder, name, blob, photo.mime_type || blob.type || "image/jpeg");
            result.skipped ? skipped++ : copied++;
          } finally { done++; progress(done,tasks); }
        }

        for (let i=0;i<reportSignatures.length;i++) {
          const signature = reportSignatures[i];
          try {
            const blob = await downloadStorage("report-signatures", signature.storage_path);
            const name = safeName(`${signature.role || "FIRMA"}_${signature.storage_path.split("/").pop()}`);
            const result = await uploadBlob(signatureFolder, name, blob, blob.type || "image/png");
            result.skipped ? skipped++ : copied++;
          } finally { done++; progress(done,tasks); }
        }

        const metadata = new Blob([JSON.stringify({
          report,
          photos: reportPhotos,
          signatures: reportSignatures,
          archived_at: new Date().toISOString(),
          archive_source: "TRANSALMA Supabase Storage"
        }, null, 2)], { type: "application/json" });
        const metaResult = await uploadBlob(reportFolder, `${reportNo}_METADATOS.json`, metadata, "application/json");
        metaResult.skipped ? skipped++ : copied++;
        done++; progress(done,tasks);
      } catch (error) {
        errors.push(`${report.report_number || report.id}: ${error.message}`);
      }
      status(`Procesados ${done} de ${tasks}. Copiados: ${copied}; ya existentes: ${skipped}; reportes con error: ${errors.length}.`);
    }
    const summary = { reports: reports.length, copied, skipped, errors };
    status(errors.length
      ? `Respaldo terminado con ${errors.length} reportes pendientes. Copiados: ${copied}; omitidos por existir: ${skipped}. Revisa los errores.`
      : `Respaldo terminado. ${reports.length} reportes revisados; ${copied} archivos copiados; ${skipped} ya existían. Supabase no se modificó.`);
    if (errors.length) console.error("Errores de archivo TRANSALMA:", errors);
    return summary;
  }


  async function listDriveFiles(query, fields = "files(id,name,mimeType,webViewLink,parents,size),nextPageToken") {
    const all = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({ q: query, pageSize: "100", fields });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await driveRequest("https://www.googleapis.com/drive/v3/files?" + params.toString());
      all.push(...(data.files || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return all;
  }

  async function searchArchivedReport() {
    if (!accessToken) throw new Error("Conecta Google Drive primero.");
    const raw = $("archiveReportNumber")?.value.trim().toUpperCase() || "";
    if (!/^TI-\d{6}$/.test(raw)) throw new Error("Escribe el número completo, por ejemplo TI-000001.");
    const out = $("archiveSearchResults");
    out.replaceChildren();
    const metadataName = raw + "_METADATOS.json";
    const matches = await listDriveFiles(
      "name = '" + escapeDriveQuery(metadataName) + "' and trashed = false",
      "files(id,name,mimeType,parents,webViewLink),nextPageToken"
    );
    if (!matches.length) {
      out.textContent = "No se encontró " + raw + " en la carpeta de archivo autorizada. Verifica que seleccionaste TRANSALMA_REPORTES_ARCHIVO.";
      return;
    }
    const metaFile = matches[0];
    const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(metaFile.id) + "?alt=media", {
      headers: { Authorization: "Bearer " + accessToken }
    });
    if (!response.ok) throw new Error("No se pudieron leer los metadatos del reporte (HTTP " + response.status + ").");
    const metadata = await response.json();
    const reportFolderId = (metaFile.parents || [])[0];
    if (!reportFolderId) throw new Error("El archivo de metadatos no tiene carpeta de reporte asociada.");
    const files = await listDriveFiles("'" + escapeDriveQuery(reportFolderId) + "' in parents and trashed = false");
    const sections = {};
    for (const file of files) {
      if (file.mimeType === FOLDER_MIME) {
        sections[file.name] = await listDriveFiles("'" + escapeDriveQuery(file.id) + "' in parents and trashed = false");
      }
    }
    const title = document.createElement("h3");
    title.textContent = raw + " · Reporte histórico encontrado";
    out.appendChild(title);
    const info = document.createElement("p");
    const report = metadata.report || {};
    info.textContent = [report.fecha, report.contenedor, report.client_name, report.status].filter(Boolean).join(" · ") || "Metadatos disponibles";
    out.appendChild(info);
    const addSection = (label, items) => {
      const heading = document.createElement("h4");
      heading.textContent = label;
      out.appendChild(heading);
      if (!items?.length) {
        const empty = document.createElement("p");
        empty.textContent = "Sin archivos registrados.";
        out.appendChild(empty);
        return;
      }
      const list = document.createElement("ul");
      for (const file of items) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "https://drive.google.com/uc?id=" + encodeURIComponent(file.id) + "&export=download";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = file.name;
        li.appendChild(a);
        list.appendChild(li);
      }
      out.appendChild(list);
    };
    addSection("PDF_REPORTES", sections.PDF_REPORTES || []);
    addSection("FOTOGRAFIAS", sections.FOTOGRAFIAS || []);
    addSection("FIRMAS", sections.FIRMAS || []);
    const jsonLink = document.createElement("a");
    jsonLink.href = "https://drive.google.com/file/d/" + encodeURIComponent(metaFile.id) + "/view";
    jsonLink.target = "_blank";
    jsonLink.rel = "noopener";
    jsonLink.textContent = "Abrir metadatos originales";
    out.appendChild(jsonLink);
    if (report.id) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Abrir reporte en el formulario de edición";
      editButton.style.marginTop = "12px";
      editButton.addEventListener("click", async () => {
        if (typeof window.TRANSALMA_OPEN_EDIT !== "function") {
          status("El formulario de edición no está disponible.");
          return;
        }
        editButton.disabled = true;
        try {
          await window.TRANSALMA_OPEN_EDIT(report.id);
          closePanel();
        } catch (error) {
          status(error.message || "No se pudo abrir el reporte para editar.");
        } finally {
          editButton.disabled = false;
        }
      });
      out.appendChild(editButton);
    }
    out.dataset.report = JSON.stringify(metadata);
  }

  function installArchiveSearch() {
    if ($("archiveSearchPanel")) return;
    const panel = document.createElement("section");
    panel.id = "archiveSearchPanel";
    panel.className = "subcard";
    panel.style.marginTop = "18px";
    const heading = document.createElement("h3");
    heading.textContent = "Buscar y recuperar reporte histórico";
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Busca por número TI y consulta el PDF, fotografías, firmas y metadatos guardados en Google Drive.";
    const row = document.createElement("div");
    row.className = "actions";
    const input = document.createElement("input");
    input.id = "archiveReportNumber";
    input.placeholder = "TI-000001";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Número de reporte histórico");
    const button = document.createElement("button");
    button.id = "searchArchivedReport";
    button.type = "button";
    button.textContent = "Buscar reporte";
    const results = document.createElement("div");
    results.id = "archiveSearchResults";
    results.style.marginTop = "14px";
    row.append(input, button);
    panel.append(heading, hint, row, results);
    $("driveArchivePanel")?.appendChild(panel);
    button.addEventListener("click", async () => {
      button.disabled = true;
      results.textContent = "Buscando en Google Drive…";
      try { await searchArchivedReport(); }
      catch (error) { results.textContent = error.message || "No se pudo buscar el reporte."; }
      finally { button.disabled = false; }
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); button.click(); }
    });
  }

  function showPanel() {
    const panel = $("driveArchivePanel");
    if (panel) panel.hidden = false;
    installArchiveSearch();
  }
  function closePanel() {
    const panel = $("driveArchivePanel");
    if (panel) panel.hidden = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("openDriveArchive")?.addEventListener("click", showPanel);
    $("closeDriveArchive")?.addEventListener("click", closePanel);
    $("driveApiKey")?.addEventListener("change", event => { apiKey = event.target.value.trim(); });
    $("connectDrive")?.addEventListener("click", async () => {
      const button = $("connectDrive"); button.disabled = true;
      try {
        apiKey = $("driveApiKey")?.value.trim() || "";
        if (!apiKey) throw new Error("Introduce la clave API de Google Picker en este equipo.");
        status("Solicitando autorización de Google…");
        await authorize();
        status("Google autorizado. Abriendo selector de carpeta…");
        selectedRoot = await chooseRootFolder();
        status(`Carpeta seleccionada: ${selectedRoot.name}. Ya puedes iniciar el respaldo.`);
        $("runDriveArchive").disabled = false;
      } catch (error) { status(error.message || "No se pudo conectar Google Drive."); }
      finally { button.disabled = false; }
    });
    $("runDriveArchive")?.addEventListener("click", async () => {
      const button = $("runDriveArchive"); button.disabled = true;
      try {
        status("Preparando respaldo. No cierres esta ventana…");
        const result = await runArchive();
        if (result.errors.length) alert("El respaldo terminó con errores. Ningún archivo de Supabase fue eliminado.");
        else alert("Respaldo completado. Ningún archivo de Supabase fue eliminado.");
      } catch (error) { status(error.message || "No se pudo completar el respaldo."); }
      finally { button.disabled = false; }
    });
  });
})();
