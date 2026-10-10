(()=> {
  const c=window.TRANSALMA_CONFIG;
  const sup=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const msg=(id,t)=>{if($(id))$(id).textContent=t||""};
  const today=()=>new Date().toISOString().slice(0,10);

  let currentUser=null;
let currentRole=null;
let currentIsAdmin=false;
let currentCanOperate=false;
let currentIsSupervisor=false;

let lastSavedReportId=sessionStorage.getItem("lastSavedReportId");
let lastSavedReportNumber=sessionStorage.getItem("lastSavedReportNumber");

  const esc=v=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[x]));

  function closeAllPanels(){
  $("formPanel").hidden=true;
  $("historyPanel").hidden=true;
  $("adminPanel").hidden=true;
  $("editPanel").hidden=true;
  $("usersPanel").hidden=true;
  $("createUserPanel").hidden=true;  
}

  function setDate(){ $("fecha").value=today(); }

  async function session(){
    const {data,error}=await sup.auth.getSession();
    if(error){console.error(error);return}
    if(data.session){
      currentUser=data.session.user;
      $("loginView").hidden=true;
      $("appView").hidden=false;
      $("userEmail").textContent=currentUser.email||"";
      setDate();

      
      const {data:profile,error:profileError}=await sup
        .from("profiles")
        .select("role,active,full_name")
        .eq("id",currentUser.id)
        .maybeSingle();

      if(profileError) console.error(profileError);

      currentRole=profile?.active ? profile.role : null;
      currentIsAdmin=currentRole==="admin";
      currentIsSupervisor=currentRole==="supervisora";
      currentCanOperate=["admin","supervisora","operador"].includes(currentRole);

      $("adminCard").hidden=!(currentIsAdmin||currentIsSupervisor);

$("openAdminUsers").hidden=!currentIsAdmin;

document.querySelectorAll('.action[data-type="mercancia"], .action[data-type="excepcion"]').forEach(button => {
  button.hidden=!currentCanOperate;
});

      $("roleLabel").textContent=
        currentIsAdmin
          ? "Administrador · control total del sistema."
          : currentIsSupervisor
            ? "Supervisora · gestión de reportes."
            : currentRole==="observador"
              ? "Observador · consulta de reportes y PDF."
              : "Operador · registro de reportes.";
    }else{
      currentUser=null;
currentRole=null;
currentIsAdmin=false;
currentCanOperate=false;
currentIsSupervisor=false;
      $("loginView").hidden=false;
      $("appView").hidden=true;
    }
  }

  $("loginForm").onsubmit=async e=>{
    e.preventDefault();
    msg("loginMessage","Iniciando sesión…");
    const {error}=await sup.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
    if(error)return msg("loginMessage",error.message);
    msg("loginMessage","");
    await session();
  };

  $("logout").onclick=async()=>{await sup.auth.signOut();closeAllPanels();await session();};

  document.querySelectorAll(".action").forEach(b=>b.onclick=async()=>{
    
    const t=b.dataset.type;

    if(!currentCanOperate && t!=="historial"){
      alert("Tu perfil solo tiene permiso para consultar reportes.");
      return;
    }

    closeAllPanels();

    if(t==="historial"){
      $("historyPanel").hidden=false;
      return history();
    }

    $("formTitle").textContent=t==="mercancia"?"Reporte de Mercancía":"Reporte de Excepción";
    $("reportType").value=t;
    $("exceptionFields").hidden=t!=="excepcion";
    $("formPanel").hidden=false;
    resetForm(t);
    window.scrollTo({top:0,behavior:"smooth"});
  });

  $("closeForm").onclick=()=>{$("formPanel").hidden=true};
  $("closeHistory").onclick=()=>{$("historyPanel").hidden=true};
  $("closeAdmin").onclick=()=>{$("adminPanel").hidden=true};
  $("closeEdit").onclick=()=>{$("editPanel").hidden=true};

  function resetForm(type){
    const legacyIds=[
  "consignatario",
  "bl",
  "bultos",
  "clase",
  "detalle",
  "observacion"
];

legacyIds.forEach(id=>{
  const element=$(id);
  if(!element)return;

  const label=element.closest("label");

  if(label){
  label.style.display=type==="mercancia"?"none":"";
}
});
  lastSavedReportId=null;
  lastSavedReportNumber=null;

  sessionStorage.removeItem("lastSavedReportId");
  sessionStorage.removeItem("lastSavedReportNumber");

  $("pdfActions").hidden=true;
  msg("pdfMessage","");

  $("reportForm").reset();
  setDate();

  $("reportType").value=type;
  $("exceptionFields").hidden=type!=="excepcion";

  const merchandiseDetails=$("merchandiseDetails");

  if(merchandiseDetails){
    merchandiseDetails.hidden=type!=="mercancia";
  }

  const merchandiseList=$("merchandiseDetailsList");

  if(merchandiseList){
    merchandiseList.innerHTML=`
      <div class="merchandise-detail" data-index="0">

        <div class="head">
          <h3>Consignatario 1</h3>
        </div>

        <div class="grid">

          <label>Consignatario
            <input type="text" class="detail-consignatario">
          </label>

          <label>BIL/B.L.
            <input type="text" class="detail-bl">
          </label>

          <label>Bultos
            <input type="number" min="0" step="1" class="detail-bultos">
          </label>

          <label>Clase de mercancía
            <input type="text" class="detail-clase" placeholder="Ej. carga general">
          </label>

          <label class="wide">Detalle de mercancía
            <textarea class="detail-detalle"></textarea>
          </label>

          <label class="wide">Observación
            <textarea class="detail-observacion"></textarea>
          </label>

        </div>

      </div>
    `;
  }

  selectedPhotos=[];
  $("photoPreview").innerHTML="";

  clearSignature("sigTransportista");
  clearSignature("sigBodega");

  msg("formMessage","");
}

  let selectedPhotos = [];

function addSelectedPhotos(files) {
  selectedPhotos = [...selectedPhotos, ...files];
  renderPhotoPreview();
}
$("addMerchandiseDetail").addEventListener("click",()=>{
  const list=$("merchandiseDetailsList");
  if(!list)return;

  const index=list.querySelectorAll(".merchandise-detail").length;

  const block=document.createElement("div");
  block.className="merchandise-detail";
  block.dataset.index=index;

  block.innerHTML=`
    <div class="head">
      <div>
        <h3>Consignatario ${index+1}</h3>
      </div>

      <button type="button" class="remove-merchandise-detail">
        ✕ Eliminar
      </button>
    </div>

    <div class="grid">

      <label>Consignatario
        <input type="text" class="detail-consignatario">
      </label>

      <label>BIL/B.L.
        <input type="text" class="detail-bl">
      </label>

      <label>Bultos
        <input type="number" min="0" step="1" class="detail-bultos">
      </label>

      <label>Clase de mercancía
        <input type="text" class="detail-clase" placeholder="Ej. carga general">
      </label>

      <label class="wide">Detalle de mercancía
        <textarea class="detail-detalle"></textarea>
      </label>

      <label class="wide">Observación
        <textarea class="detail-observacion"></textarea>
      </label>

    </div>
  `;

  block.querySelector(".remove-merchandise-detail").onclick=()=>{
    block.remove();

    [...list.querySelectorAll(".merchandise-detail")].forEach((item,i)=>{
      item.dataset.index=i;

      const title=item.querySelector("h3");
      if(title)title.textContent=`Consignatario ${i+1}`;
    });
  };

  list.appendChild(block);
});
$("galleryPhotoBtn").addEventListener("click", () => {
  $("photos").click();
});

$("takePhotoBtn").addEventListener("click", () => {
  $("cameraInput").click();
});

$("photos").addEventListener("change", () => {
  const files = [...$("photos").files];
  addSelectedPhotos(files);
  $("photos").value = "";
});

$("cameraInput").addEventListener("change", () => {
  const files = [...$("cameraInput").files];
  addSelectedPhotos(files);
  $("cameraInput").value = "";
});

function renderPhotoPreview() {
  const preview = $("photoPreview");
  preview.innerHTML = "";

  selectedPhotos.forEach((file, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "photo-item";

    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-photo";
    removeButton.textContent = "✕ Eliminar";

    removeButton.onclick = () => {
      selectedPhotos.splice(index, 1);
      renderPhotoPreview();
    };

    wrapper.appendChild(img);
    wrapper.appendChild(removeButton);
    preview.appendChild(wrapper);
  });
}

  function setupSignature(id){
    const canvas=$(id),ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#111";
    let drawing=false;
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
    const start=e=>{e.preventDefault();drawing=true;canvas.dataset.dirty="true";const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};
    const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()};
    const end=e=>{if(!drawing)return;e.preventDefault();drawing=false};
    canvas.addEventListener("pointerdown",start);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",end);canvas.addEventListener("pointerleave",end);
    canvas.dataset.dirty="false";
  }
  function clearSignature(id){
    const canvas=$(id),ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);canvas.dataset.dirty="false";
  }
  setupSignature("sigTransportista");setupSignature("sigBodega");
  document.querySelectorAll(".clear-signature").forEach(b=>b.onclick=()=>clearSignature(b.dataset.canvas));

  async function uploadPhoto(reportId,file,index){
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    const path=`${reportId}/${crypto.randomUUID()}.${ext}`;
    const {error}=await sup.storage.from("report-photos").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});
    if(error)throw error;
    const {error:dbError}=await sup.from("report_photos").insert({report_id:reportId,storage_path:path,original_name:file.name,mime_type:file.type||"image/jpeg",sort_order:index+1});
    if(dbError)throw new Error(`No se pudo guardar la fotografía en report_photos: ${dbError.message||"error RLS"}`);
  }

  async function uploadSignature(reportId,role,name,canvas){
    if(canvas.dataset.dirty!=="true")throw new Error(`Falta la firma de ${role}.`);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob)throw new Error(`No se pudo preparar la firma de ${role}.`);
    const path=`${reportId}/${role}.png`;
    const {error}=await sup.storage.from("report-signatures").upload(path,blob,{contentType:"image/png",upsert:true});
    if(error)throw error;
    const {error:dbError}=await sup.from("report_signatures").upsert({report_id:reportId,role,storage_path:path,signer_name:name.trim()||null},{onConflict:"report_id,role"});
    if(dbError)throw new Error(`No se pudo guardar la firma en report_signatures: ${dbError.message||"error RLS"}`);
  }

  $("reportForm").onsubmit=async e=>{
    e.preventDefault();
    
if(!currentCanOperate){
  msg("formMessage","Tu perfil no tiene permiso para crear reportes.");
  return;
}

    const saveButton=$("saveReport");saveButton.disabled=true;msg("formMessage","Guardando reporte…");
    try{
      const {data:{user}}=await sup.auth.getUser();
      if(!user)throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const t=$("reportType").value;
const r=$("reclamo24").value;

let merchandiseDetails=[];

if(t==="mercancia"){
  merchandiseDetails=[
    ...document.querySelectorAll(".merchandise-detail")
  ].map((block,index)=>({
    consignatario:block.querySelector(".detail-consignatario")?.value.trim()||"",
    bl:block.querySelector(".detail-bl")?.value.trim()||null,
    bultos:block.querySelector(".detail-bultos")?.value===""
      ?null
      :Number(block.querySelector(".detail-bultos").value),
    clase_mercancia:block.querySelector(".detail-clase")?.value.trim()||null,
    detalle_mercancia:block.querySelector(".detail-detalle")?.value.trim()||null,
    observacion:block.querySelector(".detail-observacion")?.value.trim()||null,
    sort_order:index+1
  }));

  merchandiseDetails=merchandiseDetails.filter(d=>d.consignatario);

  if(!merchandiseDetails.length){
    throw new Error("Agrega al menos un consignatario.");
  }
}

const firstDetail=merchandiseDetails[0];

const clientName = $("clientName").value.trim();

const clientEmails = $("clientEmail").value
  .split(/[;,\n]+/)
  .map(email => email.trim())
  .filter(Boolean);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!clientName) {
  throw new Error("Ingresa el nombre del cliente.");
}

if (clientEmails.length === 0) {
  throw new Error("Ingresa al menos un correo.");
}

if (clientEmails.length > 10) {
  throw new Error("Puedes ingresar un máximo de 10 correos.");
}

if (clientEmails.some(email => !emailRegex.test(email))) {
  throw new Error("Hay una dirección de correo no válida. Revísala.");
}

if (new Set(clientEmails.map(email => email.toLowerCase())).size !== clientEmails.length) {
  throw new Error("Hay correos duplicados. Elimina las direcciones repetidas.");
}


const p={
report_type:t,  
fecha:$("fecha").value,
client_name:clientName,
client_email:clientEmails[0],
client_emails:clientEmails,

  consignatario:t==="mercancia"
    ?firstDetail.consignatario
    :$("consignatario").value.trim(),

  bl:t==="mercancia"
    ?firstDetail.bl
    :$("bl").value.trim()||null,

  contenedor:$("contenedor").value.trim()||null,

  bultos:t==="mercancia"
    ?firstDetail.bultos
    :(()=> {
        const value=$("bultos").value;
        return value===""?null:Number(value);
      })(),

  clase:t==="mercancia"
    ?firstDetail.clase_mercancia
    :$("clase").value.trim()||null,

  detalle:t==="mercancia"
    ?firstDetail.detalle_mercancia
    :$("detalle").value.trim()||null,

  observacion:t==="mercancia"
    ?firstDetail.observacion
    :$("observacion").value.trim()||null,

  incidencias:t==="excepcion"?$("incidencias").value.trim()||null:null,

  observacion_excepcion:t==="excepcion"
    ?$("observacionExcepcion").value.trim()||null
    :null,

  reclamo_dentro_24h:t==="excepcion"
    ?(r===""?null:r==="true")
    :null,

  transportista_nombre:$("transportista").value.trim()||null,
  bodega_nombre:$("bodega").value.trim()||null,

  created_by:user.id,

  resultado:t==="excepcion"
    ?"DESCARGA CON INCIDENCIA"
    :"DESCARGA FINALIZADA CON ÉXITO"
};
      if(!p.consignatario)throw new Error("El consignatario es obligatorio.");
      if(!p.client_email)throw new Error("El correo del cliente es obligatorio.");
      if(t==="excepcion"&&!p.incidencias)throw new Error("Para una excepción debes indicar la incidencia.");
      const files=[...selectedPhotos];
      if(!files.length)throw new Error("Agrega al menos una fotografía de la mercancía.");

      const {data,error}=await sup.from("reports").insert(p).select().single();
      if(error)throw error;
      const reportId=data.id;
if(t==="mercancia" && merchandiseDetails.length){

  const detailRows=merchandiseDetails.map(detail=>({
    report_id:reportId,
    consignatario:detail.consignatario,
    bl:detail.bl,
    bultos:detail.bultos,
    clase_mercancia:detail.clase_mercancia,
    detalle_mercancia:detail.detalle_mercancia,
    observacion:detail.observacion,
    sort_order:detail.sort_order
  }));

  const {error:detailsError}=await sup
    .from("report_merchandise_details")
    .insert(detailRows);

  if(detailsError){
    throw new Error(
      `No se pudieron guardar los consignatarios: ${detailsError.message}`
    );
  }
}
      // La creación del reporte no debe bloquearse si falla únicamente la trazabilidad.
      const e1=await sup.rpc("add_report_event",{p_report_id:reportId,p_event_type:"REPORTE_CREADO",p_message:`Reporte ${data.report_number} creado`});
      if(e1.error)console.warn("Reporte creado, pero no se pudo registrar REPORTE_CREADO:",e1.error);

      for(let i=0;i<files.length;i++)await uploadPhoto(reportId,files[i],i);
      await uploadSignature(reportId,"transportista",$("transportistaNombreFirma").value,$("sigTransportista"));
      await uploadSignature(reportId,"bodega",$("bodegaNombreFirma").value,$("sigBodega"));
      const e2=await sup.rpc("add_report_event",{p_report_id:reportId,p_event_type:"SOPORTES_CARGADOS",p_message:`Fotos y firmas cargadas para ${data.report_number}`});
      if(e2.error)console.warn("Reporte guardado, pero no se pudo registrar SOPORTES_CARGADOS:",e2.error);

      lastSavedReportId=reportId;
lastSavedReportNumber=data.report_number;

sessionStorage.setItem("lastSavedReportId",reportId);
sessionStorage.setItem("lastSavedReportNumber",data.report_number);

$("pdfActions").hidden=false;
      msg("formMessage",`Reporte ${data.report_number} guardado con ${files.length} foto(s) y 2 firmas.`);
      $("reportForm").reset();setDate();clearSignature("sigTransportista");clearSignature("sigBodega");selectedPhotos=[];$("photoPreview").innerHTML="";
    }catch(error){console.error(error);msg("formMessage",error.message||"No se pudo guardar el reporte.")}
    finally{saveButton.disabled=false}
  };

  function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
async function blobToPngDataUrl(blob){
  const url=URL.createObjectURL(blob);

  try{
    const img=new Image();
    img.src=url;

    await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=reject;
    });

    const maxWidth=1600;
    const maxHeight=1200;

    let width=img.naturalWidth;
    let height=img.naturalHeight;

    const scale=Math.min(
      1,
      maxWidth/width,
      maxHeight/height
    );

    width=Math.round(width*scale);
    height=Math.round(height*scale);

    const canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=height;

    const ctx=canvas.getContext("2d");
    ctx.drawImage(img,0,0,width,height);

    return canvas.toDataURL("image/jpeg",0.82);

  }finally{
    URL.revokeObjectURL(url);
  }
}
  async function fetchReportAssets(reportId){
    const {data:report,error:reportError}=await sup.from("reports").select("*").eq("id",reportId).single();
    if(reportError)throw reportError;
    const {data:photos,error:photosError}=await sup.from("report_photos").select("storage_path,original_name,sort_order").eq("report_id",reportId).order("sort_order");
    const {data:merchandiseDetails,error:detailsError}=await sup
  .from("report_merchandise_details")
  .select("*")
  .eq("report_id",reportId)
  .order("sort_order",{ascending:true});

if(detailsError)throw detailsError;
    if(photosError)throw photosError;
    const {data:sigs,error:sigError}=await sup.from("report_signatures").select("role,storage_path,signer_name").eq("report_id",reportId);
    if(sigError)throw sigError;
    
const photoResults = await Promise.all(
  (photos || []).map(async (ph) => {
    const { data, error } = await sup.storage
      .from("report-photos")
      .download(ph.storage_path);

    if (error) throw error;

    const pngDataUrl = await blobToPngDataUrl(data);

    return {
      meta: ph,
      dataUrl: pngDataUrl
    };
  })
);

const photoData = photoResults;

const sigResults = await Promise.all(
  (sigs || []).map(async (sg) => {
    const { data, error } = await sup.storage
      .from("report-signatures")
      .download(sg.storage_path);

    if (error) throw error;

    return {
      role: sg.role,
      value: {
        ...sg,
        dataUrl: await blobToDataUrl(data)
      }
    };
  })
);

const sigData = {};
for (const item of sigResults) {
  sigData[item.role] = item.value;
}

return { report, photoData, sigData, merchandiseDetails };
  }

  function addWrapped(doc,text,x,y,maxWidth,lineHeight=6){
    const lines=doc.splitTextToSize(String(text??""),maxWidth);doc.text(lines,x,y);return y+lines.length*lineHeight;
  }

  async function generatePdf(reportId){
    if(!currentCanOperate){
  throw new Error("Tu perfil no tiene permiso para generar PDF.");
}
    console.time("PDF - Carga de recursos");
    const {jsPDF}=window.jspdf;
    const {report,photoData,sigData,merchandiseDetails}=await fetchReportAssets(reportId);
    console.timeEnd("PDF - Carga de recursos");
    const logoResponse=await fetch("logo.png");
    if(!logoResponse.ok)throw new Error("No se encontró el logo de TRANSALMA (logo.png).");
    const logoDataUrl=await blobToDataUrl(await logoResponse.blob());
    const doc=new jsPDF({unit:"mm",format:"a4"}),W=210,margin=15,content=W-margin*2;

    doc.setFillColor(255,255,255);doc.rect(0,0,W,34,"F");doc.addImage(logoDataUrl,"PNG",margin,3,68,28);
    doc.setDrawColor(11,45,77);doc.setLineWidth(.8);doc.line(margin,32,W-margin,32);
    doc.setTextColor(11,45,77);doc.setFontSize(13);doc.setFont(undefined,"bold");
    doc.text(report.report_type==="excepcion"?"REPORTE DE EXCEPCIÓN":"REPORTE DE MERCANCÍA",W-margin,12,{align:"right"});
    doc.setFontSize(9);doc.setFont(undefined,"normal");doc.setTextColor(90,105,118);doc.text("TRANSALMA INTERNACIONAL, S.A.",W-margin,18,{align:"right"});
    doc.setFont(undefined,"bold");doc.setTextColor(23,33,43);doc.text(String(report.report_number||""),W-margin,25,{align:"right"});

    let y=43;
    if(report.status==="ANULADO"){
      doc.setFillColor(190,0,0);doc.roundedRect(margin,y-7,content,12,2,2,"F");
      doc.setTextColor(255,255,255);doc.setFontSize(11);doc.setFont(undefined,"bold");doc.text("REPORTE ANULADO",W/2,y+1,{align:"center"});
      y+=15;doc.setTextColor(23,33,43);doc.setFontSize(10);
    }else{doc.setTextColor(23,33,43);doc.setFontSize(10)}
    if(report.report_type==="mercancia"){

  const colWidths=[53,31,10,45,41];
  const colX=[
    margin,
    margin+53,
    margin+84,
    margin+94,
    margin+139
  ];

  const tableWidth=180;
  const pageH=doc.internal.pageSize.getHeight();

  doc.setDrawColor(0,0,0);
  doc.setLineWidth(.35);
  doc.setTextColor(0,0,0);
  doc.setFontSize(9);

  // Datos superiores con el estilo del Excel.
  const drawHeaderLine = (label, value, x, y, width) => {
  doc.setFont(undefined, "bold");
  doc.text(label, x, y);

  const labelWidth = doc.getTextWidth(label);
  const lineStart = x + labelWidth + 3;
  const lineEnd = x + width;

  doc.setFont(undefined, "normal");

  const valueText = String(value ?? "").trim();
  const availableWidth = lineEnd - lineStart;

  if (valueText) {
    const fittedValue = doc.splitTextToSize(valueText, availableWidth);
    doc.text(fittedValue, lineStart, y);
  }

  doc.setDrawColor(120, 130, 140);
  doc.setLineWidth(0.2);
  doc.line(lineStart, y + 3, lineEnd, y + 3);
};
      

drawHeaderLine(
  "CLIENTE:",
  report.client_name || "",
  margin,
  y,
  82
);

drawHeaderLine(
  "FECHA:",
  report.fecha || "",
  margin + 90,
  y,
  90
);

y += 7;

const emailText = (
  Array.isArray(report.client_emails) && report.client_emails.length
    ? report.client_emails
    : [report.client_email].filter(Boolean)
).join("; ");

const emailLines = doc.splitTextToSize(emailText, 180 - 22);
const emailHeight = Math.max(7, emailLines.length * 4.5);

drawHeaderLine(
  "CORREO:",
  emailText,
  margin,
  y,
  180
);

y += emailHeight + 5;

drawHeaderLine(
  "VIAJE-VAPOR:",
  report.vapor || "",
  margin,
  y,
  82
);

drawHeaderLine(
  "CONTENEDOR:",
  report.contenedor || "",
  margin + 90,
  y,
  90
);

y += 8;


  const drawMerchandiseBlock=(detail)=>{

    const consignatarioLines=doc.splitTextToSize(
      String(detail.consignatario||""),
      colWidths[0]-4
    );

    const blLines=doc.splitTextToSize(
      String(detail.bl||""),
      colWidths[1]-4
    );

    const bultosLines=doc.splitTextToSize(
      String(detail.bultos??""),
      colWidths[2]-2
    );

    const claseLines=doc.splitTextToSize(
      String(detail.clase_mercancia||""),
      colWidths[3]-4
    );

    const observacionLines=doc.splitTextToSize(
      String(detail.observacion||""),
      colWidths[4]-4
    );

    const dataLines=Math.max(
      consignatarioLines.length,
      blLines.length,
      bultosLines.length,
      claseLines.length,
      observacionLines.length,
      1
    );

    const headerH=8;
    const dataH=Math.max(11,dataLines*4.2+4);

    const detailLines=doc.splitTextToSize(
      String(detail.detalle_mercancia||""),
      tableWidth-24
    );

    const detailH=Math.max(
      13,
      detailLines.length*4.5+6
    );

    const totalH=headerH+dataH+detailH+6;

    if(y+totalH>pageH-margin){

      doc.addPage();

      y=18;

      doc.setFontSize(13);
      doc.setFont(undefined,"bold");
      doc.setTextColor(11,45,77);
      doc.text(
        "REPORTE DE MERCANCÍA",
        W/2,
        y,
        {align:"center"}
      );

      doc.setFontSize(9);
      doc.setTextColor(0,0,0);

      y+=9;
    }

    // Encabezados de la tabla.
    const headers=[
      "CONSIGNATARIO",
      "B/L",
      "BULTOS",
      "CLASE DE MERCANCÍA",
      "OBSERVACIÓN"
    ];

    for(let i=0;i<5;i++){

      doc.rect(
        colX[i],
        y,
        colWidths[i],
        headerH
      );

      doc.setFont(undefined,"bold");
      doc.setFontSize(8);

      const align=i===0?"left":"center";

      doc.text(
        headers[i],
        align==="center"
          ?colX[i]+colWidths[i]/2
          :colX[i]+2,
        y+5.5,
        {align}
      );
    }

    y+=headerH;

    // Valores.
    const values=[
      consignatarioLines,
      blLines,
      bultosLines,
      claseLines,
      observacionLines
    ];

    for(let i=0;i<5;i++){

      doc.rect(
        colX[i],
        y,
        colWidths[i],
        dataH
      );

      doc.setFont(undefined,"normal");
      doc.setFontSize(8.5);

      const lines=values[i];

      const startY=
        y+
        Math.max(
          4,
          (dataH-(lines.length*4.2))/2+3
        );

      lines.forEach((line,index)=>{
        doc.text(
          line,
          i===0
            ?colX[i]+2
            :colX[i]+colWidths[i]/2,
          startY+index*4.2,
          {
            align:i===0?"left":"center"
          }
        );
      });
    }

    y+=dataH;

    // Línea MERCANCÍA del formato original.
    doc.rect(
      margin,
      y,
      tableWidth,
      detailH
    );

    doc.setFont(undefined,"bold");
    doc.setFontSize(8.5);

    doc.text(
      "MERCANCIA:",
      margin+2,
      y+5
    );

    doc.setFont(undefined,"normal");

    doc.text(
      detailLines,
      margin+23,
      y+5
    );

    y+=detailH+6;
  };

  for(const detail of merchandiseDetails||[]){
    drawMerchandiseBlock(detail);
  }

}else{

  const rows=[
    ["FECHA DE ENTRADA",report.fecha],
    ["CONTENEDOR",report.contenedor],
    ["CONSIGNATARIO",report.consignatario],
    ["BIL/B.L.",report.bl],
    ["BULTOS",report.bultos],
    ["CLASE DE MERCANCÍA",report.clase]
  ];

  for(const [label,value] of rows){
    doc.setFont(undefined,"bold");
    doc.text(label,margin,y);
    doc.setFont(undefined,"normal");
    doc.line(margin+43,y+1,W-margin,y+1);
    doc.text(String(value??""),margin+46,y);
    y+=9;
  }

  doc.setFont(undefined,"bold");
  doc.text("DETALLE DE MERCANCÍA",margin,y);
  y+=6;
  doc.setFont(undefined,"normal");
  y=addWrapped(doc,report.detalle||"",margin,y,content,5);
  y+=5;

  doc.setFont(undefined,"bold");
  doc.text("OBSERVACIÓN",margin,y);
  y+=6;
  doc.setFont(undefined,"normal");
  y=addWrapped(doc,report.observacion||"",margin,y,content,5);

  y+=5;
}
    doc.setFont(undefined,"bold");doc.text("RESULTADO",margin,y);doc.setFont(undefined,"normal");doc.text(String(report.resultado||""),margin+35,y);y+=10;
    if(report.report_type==="excepcion"){
      doc.setFont(undefined,"bold");doc.text("INCIDENCIA",margin,y);y+=6;doc.setFont(undefined,"normal");y=addWrapped(doc,report.incidencias||"",margin,y,content,5);y+=5;
      doc.setFont(undefined,"bold");doc.text("RECLAMO DENTRO DE 24 HORAS",margin,y);doc.setFont(undefined,"normal");doc.text(report.reclamo_dentro_24h==null?"":(report.reclamo_dentro_24h?"SÍ":"NO"),margin+60,y);y+=9;
      if(report.observacion_excepcion){doc.setFont(undefined,"bold");doc.text("OBSERVACIÓN DE EXCEPCIÓN",margin,y);y+=6;doc.setFont(undefined,"normal");y=addWrapped(doc,report.observacion_excepcion,margin,y,content,5);y+=5}
    }
    doc.setFont(undefined,"bold");doc.text("FIRMAS",margin,y);y+=5;
    const boxW=(content-8)/2,boxH=35;
    for(const [idx,role] of [[0,"transportista"],[1,"bodega"]]){
      const x=margin+idx*(boxW+8);doc.setDrawColor(170,180,190);doc.rect(x,y,boxW,boxH);
      const sg=sigData[role];if(sg?.dataUrl)doc.addImage(sg.dataUrl,"PNG",x+4,y+3,boxW-8,20);
      doc.setFont(undefined,"normal");doc.setFontSize(8);doc.text(role==="transportista"?"TRANSPORTISTA":"BODEGA / CHEQUEADOR",x+4,y+27);doc.text(String(sg?.signer_name||""),x+4,y+32);doc.setFontSize(10);
    }
       y+=boxH+10;

    if(report.report_type==="excepcion"){

      const nota=
        "Es importante señalar que conforme a nuestro procedimientos operativos y condiciones de servicio, cualquier reclamo relacionado con daños, faltantes o anomalías en la mercancía debe ser presentado dentro de las primeras 24-horas posteriores a la RECEPCIÓN o RETIRO de la carga, a fin de permitir una verificación oportuna de los hechos y la correspondiente documentación que sustente dicho retiro, ya que el transportista recibe conforme la carga.";

      const notaWidth=content-8;
      const notaX=margin+4;
      const notaPadding=4;
      const notaTextWidth=notaWidth-(notaPadding*2);

      const notaLines=doc.splitTextToSize(
        nota,
        notaTextWidth
      );

      const notaLineHeight=4.2;
      const notaHeight=
        notaLines.length*notaLineHeight+
        notaPadding*2+
        8;

      const pageH=doc.internal.pageSize.getHeight();

      if(y+notaHeight>pageH-margin){

        doc.addPage();
        y=18;
      }

      doc.setDrawColor(150,160,170);
      doc.setLineWidth(.4);

      doc.rect(
        notaX,
        y,
        notaWidth,
        notaHeight
      );

      doc.setFont(undefined,"bold");
      doc.setFontSize(8.5);
      doc.setTextColor(23,33,43);

      doc.text(
        "NOTA",
        notaX+notaPadding,
        y+5
      );

      doc.setFont(undefined,"normal");

      doc.text(
        notaLines,
        notaX+notaPadding,
        y+10,
        {
          lineHeightFactor:1.15
        }
      );

      y+=notaHeight+8;
    }

    if(photoData.length){
  doc.addPage();
  y=18;

  doc.setFontSize(15);
  doc.setFont(undefined,"bold");
  doc.setTextColor(11,45,77);
  doc.text("FOTOGRAFÍAS DE LA MERCANCÍA",margin,y);
  doc.setDrawColor(11,45,77);
  doc.setLineWidth(.5);
  doc.line(margin,y+3,W-margin,y+3);

  y+=10;
  doc.setTextColor(23,33,43);

  const gap=8;
const colW=(content-gap)/2;
const maxH=65;

for(let i=0;i<photoData.length;i+=4){

  const pageH=doc.internal.pageSize.getHeight();

  if(i>0){
    doc.addPage();
    y=18;
    doc.setFontSize(15);
    doc.setFont(undefined,"bold");
    doc.setTextColor(11,45,77);
    doc.text("FOTOGRAFÍAS DE LA MERCANCÍA",margin,y);
    doc.setDrawColor(11,45,77);
    doc.setLineWidth(.5);
    doc.line(margin,y+3,W-margin,y+3);
    y+=10;
  }

  const pagePhotos=photoData.slice(i,i+4);

  for(let row=0;row<2;row++){

    const rowPhotos=pagePhotos.slice(row*2,row*2+2);

    if(!rowPhotos.length)break;

    const images=[];

    for(const ph of rowPhotos){

      const props=doc.getImageProperties(ph.dataUrl);

      let iw=colW;
      let ih=iw*props.height/props.width;

      if(ih>maxH){
        ih=maxH;
        iw=ih*props.width/props.height;
      }

      images.push({
  dataUrl:ph.dataUrl,
  iw,
  ih
});
    }

    const rowH=Math.max(...images.map(img=>img.ih));

    if(y+rowH>pageH-margin){
      doc.addPage();
      y=18;
    }

    images.forEach((img,index)=>{

      const x=margin+index*(colW+gap);

      doc.addImage(
        img.dataUrl,
        "JPEG",
        x+(colW-img.iw)/2,
        y,
        img.iw,
        img.ih
      );

    });

    y+=rowH+12;
}
}
}
console.time("PDF - Generación");
    const pdfBlob=doc.output("blob");
    console.timeEnd("PDF - Generación");
    const fileName=`${report.report_number}.pdf`;
    const path=`${reportId}/${fileName}`;

    // Guardar primero el PDF en Storage.
    console.time("PDF - Subida a Supabase");
    const {error:upError}=await sup.storage
      .from("report-pdfs")
      .upload(path,pdfBlob,{contentType:"application/pdf",upsert:true});
    if(upError)throw upError;
console.timeEnd("PDF - Subida a Supabase");
    // Un reporte anulado debe conservar su estado ANULADO.
    const nextStatus=report.status==="ANULADO"?"ANULADO":"PDF_GENERADO";
    const {error:updError}=await sup
      .from("reports")
      .update({pdf_storage_path:path,status:nextStatus})
      .eq("id",reportId);
    if(updError)throw updError;

    // La trazabilidad no debe impedir la descarga del PDF.
    const ev=await sup.rpc("add_report_event",{
      p_report_id:reportId,
      p_event_type:"PDF_GENERADO",
      p_message:`PDF generado para ${report.report_number}`
    });
    if(ev.error)console.warn("PDF generado, pero no se pudo registrar el evento:",ev.error);

    // Descargar después de guardar y actualizar todo.
    doc.save(fileName);
  }

  $("generatePdf").onclick=async()=>{
    if(!lastSavedReportId)return;
    const b=$("generatePdf");b.disabled=true;msg("pdfMessage","Generando PDF…");
    try{await generatePdf(lastSavedReportId);msg("pdfMessage",`PDF ${lastSavedReportNumber} generado y descargado correctamente.`)}
    catch(error){console.error(error);msg("pdfMessage",error.message||"No se pudo generar el PDF.")}
    finally{b.disabled=false}
  };
$("sendReportEmail").onclick=async()=>{
    if(!currentCanOperate){
    msg("pdfMessage","Tu perfil no tiene permiso para enviar correos.");
    return;
  }
  const b=$("sendReportEmail");
  const old=b.textContent;

  b.disabled=true;
  b.textContent="Enviando...";
  msg("pdfMessage","Enviando reporte a los destinatarios registrados...");

  try{
    const {data,error}=await sup.functions.invoke("send-report-email",{
      body:{
        report_id:lastSavedReportId
      }
    });

    if(error)throw error;

    if(!data?.success){
      throw new Error(data?.error || "No se pudo enviar el correo.");
    }

    msg(
      "pdfMessage",
      data.message || `Reporte ${lastSavedReportNumber} enviado correctamente al cliente.`
    );

    b.textContent="✓ Enviado";
  }catch(error){
    console.error("ERROR ENVÍO CORREO:",error);

    msg(
      "pdfMessage",
      error.message || "No se pudo enviar el correo."
    );

    b.textContent=old;
  }finally{
    b.disabled=false;
  }
};
  async function downloadStoredPdf(reportId){
  const {data:report,error:reportError}=await sup
    .from("reports")
    .select("report_number,pdf_storage_path")
    .eq("id",reportId)
    .single();

  if(reportError)throw reportError;

  if(!report?.pdf_storage_path){
    throw new Error("Este reporte todavía no tiene un PDF almacenado.");
  }

  const {data:file,error}=await sup.storage
    .from("report-pdfs")
    .download(report.pdf_storage_path);

  if(error)throw error;

  const url=URL.createObjectURL(file);
  const a=document.createElement("a");
  a.href=url;
  a.download=`${report.report_number}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
  async function history(){
    const {data,error}=await sup.from("reports")
  .select("id,report_number,fecha,report_type,contenedor,client_name,consignatario,status,resultado")
  .order("created_at",{ascending:false})
  .limit(100);
    if(error)return $("historyContent").textContent=error.message;
    if(!data.length)return $("historyContent").textContent="No hay reportes registrados.";
    $("historyContent").innerHTML="<div class='table-wrap'><table><tr><th>Reporte</th><th>Fecha</th><th>Tipo</th><th>Contenedor</th><th>Cliente</th><th>Resultado</th><th>Estado</th><th>PDF</th></tr>"+
      data.map(r=>`<tr><td>${esc(r.report_number)}</td><td>${esc(r.fecha)}</td><td>${esc(r.report_type)}</td><td>${esc(r.contenedor)}</td><td>${esc(r.client_name)}</td><td>${esc(r.resultado)}</td><td><span class="status ${r.status==="ANULADO"?"status-danger":""}">${esc(r.status)}</span></td><td><button type="button" class="history-pdf" data-report-id="${esc(r.id)}">📄 PDF</button></td></tr>`).join("")+"</table></div>";
    document.querySelectorAll(".history-pdf").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;const old=btn.textContent;btn.textContent="Descargando...";try{await downloadStoredPdf(btn.dataset.reportId)}catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent=old}})
  }

  async function adminHistory(){
    if(!(currentIsAdmin||currentIsSupervisor))return;
    closeAllPanels();$("adminPanel").hidden=false;$("adminContent").textContent="Cargando…";
    const {data,error}=await sup.from("reports").select("id,report_number,fecha,report_type,contenedor,consignatario,status,resultado,is_test,updated_at").order("created_at",{ascending:false}).limit(100);
    if(error)return $("adminContent").textContent=error.message;
    if(!data.length)return $("adminContent").textContent="No hay reportes registrados.";
    $("adminContent").innerHTML="<div class='table-wrap'><table><tr><th>Reporte</th><th>Fecha</th><th>Tipo</th><th>Contenedor</th><th>Estado</th><th>Prueba</th><th>Acciones</th></tr>"+
      data.map(r=>`<tr>
        <td><b>${esc(r.report_number)}</b></td><td>${esc(r.fecha)}</td><td>${esc(r.report_type)}</td><td>${esc(r.contenedor)}</td>
        <td><span class="status ${r.status==="ANULADO"?"status-danger":""}">${esc(r.status)}</span></td>
        <td>${r.is_test?"Sí":"No"}</td>
        <td class="actions-cell">
          
          <button type="button" class="admin-pdf" data-id="${esc(r.id)}">📄 PDF</button>
          ${(currentIsAdmin||currentIsSupervisor)&&r.status!=="ANULADO"
            ? `<button type="button" class="admin-edit" data-id="${esc(r.id)}">✏️ Editar</button>`
            : ""}
          ${currentIsAdmin
            ? `<button type="button" class="admin-audit" data-id="${esc(r.id)}">🕘 Cambios</button>`
            : ""}
          ${(currentIsAdmin||currentIsSupervisor)&&r.status!=="ANULADO"
            ? `<button type="button" class="admin-annul" data-id="${esc(r.id)}">🚫 Anular</button>`
            : ""}
          ${(currentIsAdmin||currentIsSupervisor)&&(r.status==="EMAIL_ENVIADO"||r.status==="PDF_GENERADO")
            ? `<button type="button" class="admin-resend" data-id="${esc(r.id)}">${r.status==="EMAIL_ENVIADO"?"📧 Reenviar":"📧 Enviar"}</button>`
            : ""}
          ${currentIsAdmin&&r.is_test
            ? `<button type="button" class="admin-delete-test danger" data-id="${esc(r.id)}">🗑️ Eliminar prueba</button>`
            : ""}
        </td>
      </tr>`).join("")+"</table></div>";

    document.querySelectorAll(".admin-pdf").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await generatePdf(b.dataset.id);b.textContent="✓ PDF"}catch(e){alert(e.message)}finally{b.disabled=false}});
    document.querySelectorAll(".admin-edit").forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
    document.querySelectorAll(".admin-audit").forEach(b=>b.onclick=()=>showAudit(b.dataset.id));
    document.querySelectorAll(".admin-annul").forEach(b=>b.onclick=()=>annulReport(b.dataset.id));
    document.querySelectorAll(".admin-resend").forEach(b=>{
  b.onclick=()=>resendReport(b.dataset.id);
});
    document.querySelectorAll(".admin-delete-test").forEach(b=>b.onclick=()=>deleteTestReport(b.dataset.id));
  }

  $("openAdminHistory").onclick=adminHistory;
$("openAdminUsers").onclick=usersAdmin;
$("closeUsers").onclick=()=>{$("usersPanel").hidden=true};

async function usersAdmin(){
  if(!currentIsAdmin)return;

  closeAllPanels();
  $("usersPanel").hidden=false;
  $("usersContent").textContent="Cargando…";

  const {data,error}=await sup
    .from("profiles")
    .select("id,email,full_name,role,active,created_at,updated_at")
    .order("email");

  if(error){
    $("usersContent").textContent=error.message;
    return;
  }

  if(!data.length){
    $("usersContent").textContent="No hay usuarios registrados.";
    return;
  }

  $("usersContent").innerHTML=
    "<div class='table-wrap'><table>"+
    "<tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acción</th></tr>"+
    data.map(u=>`
      <tr>
        <td>
          <input class="user-name" data-id="${esc(u.id)}" value="${esc(u.full_name||"")}">
        </td>
        <td>${esc(u.email||"")}</td>
        <td>
          
<select class="user-role" data-id="${esc(u.id)}">
  <option value="operador" ${u.role==="operador"?"selected":""}>Operador</option>
  <option value="supervisora" ${u.role==="supervisora"?"selected":""}>Supervisora</option>
  <option value="observador" ${u.role==="observador"?"selected":""}>Observador</option>
  <option value="admin" ${u.role==="admin"?"selected":""}>Administrador</option>
</select>

        </td>
        <td>
          <select class="user-active" data-id="${esc(u.id)}">
            <option value="true" ${u.active?"selected":""}>Activo</option>
            <option value="false" ${!u.active?"selected":""}>Inactivo</option>
          </select>
        </td>
        <td>
          <button type="button" class="save-user" data-id="${esc(u.id)}">💾 Guardar</button>
        </td>
      </tr>
    `).join("")+
    "</table></div>";

  document.querySelectorAll(".save-user").forEach(button=>{
    button.onclick=()=>saveUser(button.dataset.id);
  });
}
$("openCreateUser").onclick=()=>{
  $("createUserPanel").hidden=false;
  $("createUserMsg").textContent="";
  $("newUserName").value="";
  $("newUserEmail").value="";
  $("newUserPassword").value="";
  $("newUserRole").value="operador";
  $("newUserActive").value="true";
};

$("cancelCreateUser").onclick=()=>{
  $("createUserPanel").hidden=true;
  $("createUserMsg").textContent="";
};

$("createUserForm").onsubmit=async event=>{
  event.preventDefault();

  if(!currentIsAdmin)return;

  const button=$("createUserButton");
  const msgEl=$("createUserMsg");

  const full_name=$("newUserName").value.trim();
  const email=$("newUserEmail").value.trim().toLowerCase();
  const password=$("newUserPassword").value;
  const role=$("newUserRole").value;
  const active=$("newUserActive").value==="true";

  if(!full_name){
    msgEl.textContent="El nombre es obligatorio.";
    return;
  }

  if(!email){
    msgEl.textContent="El correo es obligatorio.";
    return;
  }

  if(password.length<8){
    msgEl.textContent="La contraseña debe tener al menos 8 caracteres.";
    return;
  }

  button.disabled=true;
  msgEl.textContent="Creando usuario…";

  const {data,error}=await sup.functions.invoke("create-user",{
    body:{
      full_name,
      email,
      password,
      role,
      active
    }
  });

  button.disabled=false;

  if(error){
    console.error(error);
    msgEl.textContent="No se pudo crear el usuario.";
    return;
  }

  if(!data||!data.ok){
    msgEl.textContent=data?.error||"No se pudo crear el usuario.";
    return;
  }

  msgEl.textContent="Usuario creado correctamente.";
  $("createUserForm").reset();
  $("newUserRole").value="operador";
  $("newUserActive").value="true";

  setTimeout(()=>{
    $("createUserPanel").hidden=true;
    usersAdmin();
  },800);
};
async function saveUser(userId){
  if(!currentIsAdmin)return;

  const nameInput=document.querySelector(`.user-name[data-id="${CSS.escape(userId)}"]`);
  const roleInput=document.querySelector(`.user-role[data-id="${CSS.escape(userId)}"]`);
  const activeInput=document.querySelector(`.user-active[data-id="${CSS.escape(userId)}"]`);

  if(!nameInput||!roleInput||!activeInput)return;

  if(userId===currentUser.id && activeInput.value==="false"){
    alert("No puedes desactivar tu propio usuario mientras estás conectado.");
    return;
  }

  if(userId===currentUser.id && roleInput.value!=="admin"){
    alert("No puedes quitarte el rol de administrador mientras estás conectado.");
    return;
  }

  const button=document.querySelector(`.save-user[data-id="${CSS.escape(userId)}"]`);
  if(button)button.disabled=true;

  const {error}=await sup
    .from("profiles")
    .update({
      full_name:nameInput.value.trim()||null,
      role:roleInput.value,
      active:activeInput.value==="true",
      updated_at:new Date().toISOString()
    })
    .eq("id",userId);

  if(button)button.disabled=false;

  if(error){
    alert("No se pudo guardar el usuario: "+error.message);
    return;
  }

  alert("Usuario actualizado correctamente.");
  usersAdmin();
}
  
  function createEditDetailRow(detail={}){
    const list=$("editDetailsList");
    const row=document.createElement("div");
    row.className="card edit-detail-row";
    row.style.marginBottom="14px";

    const heading=document.createElement("h4");
    heading.textContent="Consignatario";
    row.appendChild(heading);

    const fields=[
      ["Consignatario","consignatario",detail.consignatario||"",true],
      ["B/L","bl",detail.bl||"",false],
      ["Bultos","bultos",detail.bultos??"",false],
      ["Clase de mercancía","clase_mercancia",detail.clase_mercancia||"",false],
      ["Detalle de mercancía","detalle_mercancia",detail.detalle_mercancia||"",false],
      ["Observación","observacion",detail.observacion||"",false]
    ];

    fields.forEach(([label,key,value,required])=>{
      const wrap=document.createElement("label");
      wrap.textContent=label;

      const control=(key==="detalle_mercancia"||key==="observacion")
        ?document.createElement("textarea")
        :document.createElement("input");

      control.className="edit-detail-field";
      control.dataset.field=key;
      control.value=value;

      if(key==="bultos"){
        control.type="number";
        control.min="0";
        control.step="1";
      }

      if(required)control.required=true;

      wrap.appendChild(control);
      row.appendChild(wrap);
    });

    const remove=document.createElement("button");
    remove.type="button";
    remove.className="secondary remove-edit-detail";
    remove.textContent="Quitar consignatario";

    remove.addEventListener("click",()=>{
      if(list.querySelectorAll(".edit-detail-row").length<=1){
        return alert("Debe conservar al menos un consignatario.");
      }
      row.remove();
    });

    row.appendChild(remove);
    list.appendChild(row);
  }

  $("addEditDetail").addEventListener("click",()=>{
    createEditDetailRow({});
  });

  async function openEdit(reportId){
    if(!(currentIsAdmin||currentIsSupervisor))return;

    const {data,error}=await sup
      .from("reports").select("*").eq("id",reportId).single();

    if(error)return alert(error.message);
    if(data.status==="ANULADO"){
      return alert("Un reporte anulado no se puede editar.");
    }

    let details=[];

    if(data.report_type==="mercancia"){
      const {data:rows,error:detailError}=await sup
        .from("report_merchandise_details")
        .select("*")
        .eq("report_id",reportId)
        .order("sort_order",{ascending:true});

      if(detailError)return alert(detailError.message);

      details=rows||[];

      if(!details.length){
        details=[{
          consignatario:data.consignatario||"",
          bl:data.bl||"",
          bultos:data.bultos??"",
          clase_mercancia:data.clase_mercancia||data.clase||"",
          detalle_mercancia:data.detalle_mercancia||data.detalle||"",
          observacion:data.observacion||"",
          sort_order:1
        }];
      }
    }

    closeAllPanels();
    $("editPanel").hidden=false;

    $("editReportId").value=data.id;
    $("editReportLabel").textContent=
      `${data.report_number} · ${data.report_type}`;

    $("editFecha").value=data.fecha||"";
    $("editContenedor").value=data.contenedor||"";
    $("editClientName").value=data.client_name||"";

    $("editClientEmails").value=(
      Array.isArray(data.client_emails)&&data.client_emails.length
        ?data.client_emails
        :[data.client_email].filter(Boolean)
    ).join("; ");

    $("editTransportista").value=data.transportista_nombre||"";
    $("editBodega").value=data.bodega_nombre||"";
    $("editIncidencias").value=data.incidencias||"";
    $("editObservacionExcepcion").value=
      data.observacion_excepcion||"";

    $("editReclamo24").value=
      data.reclamo_dentro_24h==null
        ?""
        :String(data.reclamo_dentro_24h);

    $("editReason").value="";
    msg("editMessage","");

    const list=$("editDetailsList");
    list.replaceChildren();

    if(data.report_type==="mercancia"){
      details.forEach(detail=>createEditDetailRow(detail));
    }
  }

  function parseClientEmails(value){
    return String(value||"").split(/[;,\n]+/).map(email=>email.trim()).filter(Boolean);
  }
  function validateClientEmails(emails){
    const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emails.length)throw new Error("Ingresa al menos un correo.");
    if(emails.length>10)throw new Error("Puedes ingresar un máximo de 10 correos.");
    if(emails.some(email=>!emailRegex.test(email)))throw new Error("Hay una dirección de correo no válida. Revísala.");
    if(new Set(emails.map(email=>email.toLowerCase())).size!==emails.length)throw new Error("Hay correos duplicados. Elimina las direcciones repetidas.");
    return emails;
  }

  function changed(oldValue,newValue){return String(oldValue??"")!==String(newValue??"")}

 
$("editForm").onsubmit=async e=>{
  e.preventDefault();

  if(!(currentIsAdmin||currentIsSupervisor))return;

  const id=$("editReportId").value;
  const reason=$("editReason").value.trim();
  const button=$("saveEdit");

  if(!reason)return msg("editMessage","Indique el motivo de la corrección.");

  button.disabled=true;

  try{
    const {data:old,error:readError}=await sup
      .from("reports").select("*").eq("id",id).single();

    if(readError)throw readError;
    if(old.status==="ANULADO")throw new Error("Un reporte anulado no se puede editar.");

    
    const isMerchandise = old.report_type === "mercancia";
    let oldDetails = [];

    if (isMerchandise) {
      const { data: rows, error: detailsError } = await sup
        .from("report_merchandise_details")
        .select("*")
        .eq("report_id", id)
        .order("sort_order", { ascending: true });

      if (detailsError) throw detailsError;

      oldDetails = rows || [];
    }

    const detailRows = isMerchandise
      ? [...document.querySelectorAll("#editDetailsList .edit-detail-row")]
      : [];

    const details = detailRows.map((row, index) => {
      const field = key => row.querySelector(
        `.edit-detail-field[data-field="${key}"]`
      );

      const consignatario = field("consignatario")?.value.trim() || "";

      if (!consignatario) {
        throw new Error(`Falta el consignatario ${index + 1}.`);
      }

      const bultosValue = field("bultos")?.value ?? "";

      if (bultosValue !== "" &&
          (!Number.isInteger(Number(bultosValue)) || Number(bultosValue) < 0)) {
        throw new Error(`Los bultos del consignatario ${index + 1} no son válidos.`);
      }

      return {
        consignatario,
        bl: field("bl")?.value.trim() || null,
        bultos: bultosValue === "" ? null : Number(bultosValue),
        clase_mercancia: field("clase_mercancia")?.value.trim() || null,
        detalle_mercancia: field("detalle_mercancia")?.value.trim() || null,
        observacion: field("observacion")?.value.trim() || null,
        sort_order: index + 1
      };
    });

    if (isMerchandise && details.length === 0) {
      throw new Error("Debe conservar al menos un consignatario.");
    }

    const first = details[0];

    const r = $("editReclamo24").value;
    const editClientName = $("editClientName").value.trim();
    const editClientEmails = validateClientEmails(
      parseClientEmails($("editClientEmails").value)
    );

    if (!editClientName) {
    throw new Error("Ingresa el nombre del cliente.");
    }

    const payload = {
      fecha: $("editFecha").value,
      contenedor: $("editContenedor").value.trim() || null,

      // Mercancía: datos del primer consignatario.
      // Excepción: conservar los datos existentes que no tienen campos editables.
      consignatario: isMerchandise ? first.consignatario : old.consignatario,
      bl: isMerchandise ? first.bl : old.bl,
      bultos: isMerchandise
        ? (first.bultos === null ? null : String(first.bultos))
        : old.bultos,
      clase: isMerchandise ? first.clase_mercancia : old.clase,
      detalle: isMerchandise ? first.detalle_mercancia : old.detalle,
      observacion: isMerchandise ? first.observacion : old.observacion,

      client_name: editClientName,
      client_emails: editClientEmails,
      client_email: editClientEmails[0],
      transportista_nombre: $("editTransportista").value.trim() || null,
      bodega_nombre: $("editBodega").value.trim() || null,
      incidencias: $("editIncidencias").value.trim() || null,
      observacion_excepcion:
        $("editObservacionExcepcion").value.trim() || null,
      reclamo_dentro_24h: r === "" ? null : r === "true"
    };

    if (!payload.client_email) {
      throw new Error("El correo del cliente es obligatorio.");
    }

    const changes={};
    for(const k of Object.keys(payload)){
      if(changed(old[k],payload[k])){
        changes[k]={
          antes:old[k]??null,
          despues:payload[k]??null
        };
      }
    }

    
    const normalizeDetailsForAudit = rows => (rows || []).map(d => ({
      consignatario: (d.consignatario || "").trim(),
      bl: d.bl || null,
      bultos: d.bultos == null || d.bultos === "" ? null : Number(d.bultos),
      clase_mercancia: d.clase_mercancia || null,
      detalle_mercancia: d.detalle_mercancia || null,
      observacion: d.observacion || null,
      sort_order: Number(d.sort_order || 0)
    }));

    const oldDetailsForAudit = normalizeDetailsForAudit(oldDetails);
    const newDetailsForAudit = normalizeDetailsForAudit(details);

    if (JSON.stringify(oldDetailsForAudit) !== JSON.stringify(newDetailsForAudit)) {
      changes.consignatarios = {
        antes: oldDetailsForAudit,
        despues: newDetailsForAudit
      };
    }

    if(old.status!=="PENDIENTE"){
      changes.status={antes:old.status,despues:"PENDIENTE"};
    }

    if(!Object.keys(changes).length){
      throw new Error("No se detectaron cambios.");
    }

    const {error:saveError}=await sup.rpc("save_report_edit_atomic",{
      p_report_id:id,
      p_reason:reason,
      p_payload:payload,
      p_changes:changes,
      p_details:details
    });

    if(saveError)throw saveError;

    msg("editMessage","Corrección guardada y registrada en auditoría.");
    setTimeout(adminHistory,700);

  }catch(error){
    console.error("Error al editar reporte:",error);
    msg("editMessage",error.message||"No se pudo guardar la corrección.");
  }finally{
    button.disabled=false;
  }
};

  async function resendReport(reportId){
  if(!(currentIsAdmin||currentIsSupervisor))return;
  if(!confirm("¿Desea reenviar este reporte al correo registrado del cliente?")){
    return;
  }

  const button=document.querySelector(
    `.admin-resend[data-id="${reportId}"]`
  );

  if(button){
    button.disabled=true;
    button.textContent="Enviando…";
  }

  try{
    const {data,error}=await sup.functions.invoke("send-report-email",{
      body:{
        report_id:reportId
      }
    });

    if(error)throw error;

    if(!data?.success){
      throw new Error(
        data?.error || "No se pudo reenviar el correo."
      );
    }

    const {error:eventError}=await sup.rpc("add_report_event",{
      p_report_id:reportId,
      p_event_type:"EMAIL_REENVIADO",
      p_message:"Reporte reenviado al cliente"
    });

    if(eventError){
      console.warn(
        "Correo reenviado, pero no se pudo registrar el evento:",
        eventError
      );
    }

    alert(
      data.message ||
      "Reporte reenviado correctamente al cliente."
    );

    adminHistory();

  }catch(error){
    console.error("ERROR REENVÍO:",error);

    alert(
      error.message ||
      "No se pudo reenviar el correo."
    );

    if(button){
      button.disabled=false;
      button.textContent="📧 Reenviar";
    }
  }
}
  async function annulReport(reportId){
    if(!(currentIsAdmin||currentIsSupervisor))return;
    const reason=prompt("Motivo de la anulación del reporte:");
    if(!reason||!reason.trim())return;
    if(!confirm("¿Confirmar ANULACIÓN? El reporte permanecerá en el historial."))return;
    const {error}=await sup.rpc("admin_annul_report",{p_report_id:reportId,p_reason:reason.trim()});
    if(error)return alert(error.message);
    alert("Reporte anulado correctamente.");
    adminHistory();
  }

  async function deleteTestReport(reportId){
    if(!currentIsAdmin)return;
    const reason=prompt("Motivo para eliminar este reporte de PRUEBA:");
    if(!reason||!reason.trim())return;
    if(!confirm("Solo se eliminará si está marcado como prueba. ¿Continuar?"))return;
    const {error}=await sup.rpc("admin_delete_test_report",{p_report_id:reportId,p_reason:reason.trim()});
    if(error)return alert(error.message);
    alert("Reporte de prueba eliminado.");
    adminHistory();
  }

  async function showAudit(reportId){
    if(!currentIsAdmin)return;
    const {data,error}=await sup.from("report_audit_log").select("action,reason,changes,changed_at,changed_by").eq("report_id",reportId).order("changed_at",{ascending:false});
    if(error)return alert(error.message);
    if(!data.length)return alert("No hay cambios registrados para este reporte.");
    const lines=data.map(x=>{
      const when=new Date(x.changed_at).toLocaleString("es-PA");
      return `${when}\nAcción: ${x.action}\nMotivo: ${x.reason||"—"}\nCambios: ${JSON.stringify(x.changes,null,2)}`;
    });
    alert(lines.join("\n\n-------------------------\n\n"));
  }

  sup.auth.onAuthStateChange(()=>setTimeout(session,0));
  session();
})();
