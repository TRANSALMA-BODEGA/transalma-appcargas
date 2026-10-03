(()=>{
  const c=window.TRANSALMA_CONFIG;
  const sup=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const msg=(id,t)=>$(id).textContent=t||"";
  const today=()=>new Date().toISOString().slice(0,10);
  let lastSavedReportId=null;
  let lastSavedReportNumber=null;

  function setDate(){ $("fecha").value=today(); }

  async function session(){
    const {data}=await sup.auth.getSession();
    if(data.session){
      $("loginView").hidden=true;
      $("appView").hidden=false;
      $("userEmail").textContent=data.session.user.email||"";
      setDate();
    }else{
      $("loginView").hidden=false;
      $("appView").hidden=true;
    }
  }

  $("loginForm").onsubmit=async e=>{
    e.preventDefault();
    msg("loginMessage","Iniciando sesión…");
    const {error}=await sup.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error)return msg("loginMessage",error.message);
    msg("loginMessage","");
    await session();
  };

  $("logout").onclick=async()=>{await sup.auth.signOut();await session();};

  document.querySelectorAll(".action").forEach(b=>b.onclick=async()=>{
    const t=b.dataset.type;
    $("formPanel").hidden=true;
    $("historyPanel").hidden=true;
    if(t==="historial"){
      $("historyPanel").hidden=false;
      return history();
    }
    $("formTitle").textContent=t==="mercancia"?"Reporte de Mercancía":"Reporte de Excepción";
    $("reportType").value=t;
    $("exceptionFields").hidden=t!=="excepcion";
    $("formPanel").hidden=false;
    resetForm();
  });

  $("closeForm").onclick=()=>$("formPanel").hidden=true;
  $("closeHistory").onclick=()=>$("historyPanel").hidden=true;

  function resetForm(){
    lastSavedReportId=null; lastSavedReportNumber=null;
    $("pdfActions").hidden=true; msg("pdfMessage","");
    $("reportForm").reset();
    setDate();
    $("reportType").value=$("formTitle").textContent==="Reporte de Excepción"?"excepcion":"mercancia";
    $("exceptionFields").hidden=$("reportType").value!=="excepcion";
    $("photoPreview").innerHTML="";
    clearSignature("sigTransportista");
    clearSignature("sigBodega");
    msg("formMessage","");
  }

  $("photos").addEventListener("change",()=>{
    const files=[...$("photos").files];
    $("photoPreview").innerHTML="";
    files.forEach(file=>{
      const img=document.createElement("img");
      img.alt=file.name;
      img.src=URL.createObjectURL(file);
      $("photoPreview").appendChild(img);
    });
  });

  function setupSignature(id){
    const canvas=$(id),ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#111";
    let drawing=false,dirty=false;
    const point=e=>{
      const r=canvas.getBoundingClientRect();
      const source=e.touches?e.touches[0]:e;
      return {x:(source.clientX-r.left)*canvas.width/r.width,y:(source.clientY-r.top)*canvas.height/r.height};
    };
    const start=e=>{e.preventDefault();drawing=true;dirty=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);};
    const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();};
    const end=e=>{if(!drawing)return;e.preventDefault();drawing=false;};
    canvas.addEventListener("pointerdown",start);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",end);canvas.addEventListener("pointerleave",end);
    canvas.dataset.dirty="false";
    canvas.addEventListener("pointerdown",()=>canvas.dataset.dirty="true");
  }

  function clearSignature(id){
    const canvas=$(id),ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    canvas.dataset.dirty="false";
  }

  setupSignature("sigTransportista");
  setupSignature("sigBodega");
  document.querySelectorAll(".clear-signature").forEach(b=>b.onclick=()=>clearSignature(b.dataset.canvas));

  async function uploadPhoto(reportId,file,index){
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    const path=`${reportId}/${crypto.randomUUID()}.${ext}`;
    const {error}=await sup.storage.from("report-photos").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});
    if(error)throw error;
    const {error:dbError}=await sup.from("report_photos").insert({report_id:reportId,storage_path:path,original_name:file.name,mime_type:file.type||"image/jpeg",sort_order:index+1});
    if(dbError)throw dbError;
  }

  async function uploadSignature(reportId,role,name,canvas){
    if(canvas.dataset.dirty!=="true")throw new Error(`Falta la firma de ${role}.`);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob)throw new Error(`No se pudo preparar la firma de ${role}.`);
    const path=`${reportId}/${role}.png`;
    const {error}=await sup.storage.from("report-signatures").upload(path,blob,{contentType:"image/png",upsert:true});
    if(error)throw error;
    const {error:dbError}=await sup.from("report_signatures").upsert({report_id:reportId,role,storage_path:path,signer_name:name.trim()||null},{onConflict:"report_id,role"});
    if(dbError)throw dbError;
  }

  $("reportForm").onsubmit=async e=>{
    e.preventDefault();
    const saveButton=$("saveReport");
    saveButton.disabled=true;
    msg("formMessage","Guardando reporte…");
    try{
      const {data:{user}}=await sup.auth.getUser();
      if(!user)throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const t=$("reportType").value;
      const r=$("reclamo24").value;
      const bultos=$("bultos").value;
      const p={
        report_type:t,
        fecha:$("fecha").value,
        client_email:$("clientEmail").value.trim(),
        consignatario:$("consignatario").value.trim(),
        bl:$("bl").value.trim()||null,
        contenedor:$("contenedor").value.trim()||null,
        bultos:bultos===""?null:Number(bultos),
        clase:$("clase").value.trim()||null,
        detalle:$("detalle").value.trim()||null,
        observacion:$("observacion").value.trim()||null,
        incidencias:t==="excepcion"?$("incidencias").value.trim()||null:null,
        observacion_excepcion:t==="excepcion"?$("observacionExcepcion").value.trim()||null:null,
        reclamo_dentro_24h:t==="excepcion"?(r===""?null:r==="true"):null,
        transportista_nombre:$("transportista").value.trim()||null,
        bodega_nombre:$("bodega").value.trim()||null,
        created_by:user.id,
        resultado:t==="excepcion"?"DESCARGA CON INCIDENCIA":"DESCARGA FINALIZADA CON ÉXITO"
      };
      if(!p.consignatario)throw new Error("El consignatario es obligatorio.");
      if(!p.client_email)throw new Error("El correo del cliente es obligatorio.");
      if(t==="excepcion"&&!p.incidencias)throw new Error("Para una excepción debes indicar la incidencia.");
      const files=[...$("photos").files];
      if(!files.length)throw new Error("Agrega al menos una fotografía de la mercancía.");

      const {data,error}=await sup.from("reports").insert(p).select().single();
      if(error)throw error;
      const reportId=data.id;

      await sup.rpc("add_report_event",{p_report_id:reportId,p_event_type:"REPORTE_CREADO",p_message:`Reporte ${data.report_number} creado`});
      for(let i=0;i<files.length;i++)await uploadPhoto(reportId,files[i],i);
      await uploadSignature(reportId,"transportista",$("transportistaNombreFirma").value,$("sigTransportista"));
      await uploadSignature(reportId,"bodega",$("bodegaNombreFirma").value,$("sigBodega"));
      await sup.rpc("add_report_event",{p_report_id:reportId,p_event_type:"SOPORTES_CARGADOS",p_message:`Fotos y firmas cargadas para ${data.report_number}`});
      lastSavedReportId=reportId; lastSavedReportNumber=data.report_number;
      $("pdfActions").hidden=false;
      $("pdfActions").style.display="block";
      requestAnimationFrame(()=>$("pdfActions").scrollIntoView({behavior:"smooth",block:"center"}));
      msg("formMessage",`Reporte ${data.report_number} guardado con ${files.length} foto(s) y 2 firmas. Ahora puedes generar el PDF.`);
      $("reportForm").reset();
      setDate();
      clearSignature("sigTransportista");clearSignature("sigBodega");
      $("photoPreview").innerHTML="";
    }catch(error){
      console.error(error);
      msg("formMessage",error.message||"No se pudo guardar el reporte.");
    }finally{saveButton.disabled=false;}
  };

  function blobToDataUrl(blob){
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
  }

  async function fetchReportAssets(reportId){
    const {data:report,error:reportError}=await sup.from("reports").select("*").eq("id",reportId).single();
    if(reportError)throw reportError;
    const {data:photos,error:photosError}=await sup.from("report_photos").select("storage_path,original_name,sort_order").eq("report_id",reportId).order("sort_order");
    if(photosError)throw photosError;
    const {data:sigs,error:sigError}=await sup.from("report_signatures").select("role,storage_path,signer_name").eq("report_id",reportId);
    if(sigError)throw sigError;
    const photoData=[];
    for(const ph of photos||[]){
      const {data,error}=await sup.storage.from("report-photos").download(ph.storage_path);
      if(error)throw error;
      photoData.push({meta:ph,dataUrl:await blobToDataUrl(data)});
    }
    const sigData={};
    for(const sg of sigs||[]){
      const {data,error}=await sup.storage.from("report-signatures").download(sg.storage_path);
      if(error)throw error;
      sigData[sg.role]={...sg,dataUrl:await blobToDataUrl(data)};
    }
    return {report,photoData,sigData};
  }

  function addWrapped(doc,text,x,y,maxWidth,lineHeight=6){
    const lines=doc.splitTextToSize(String(text??""),maxWidth); doc.text(lines,x,y); return y+lines.length*lineHeight;
  }

  async function generatePdf(reportId){
    const {jsPDF}=window.jspdf;
    const {report,photoData,sigData}=await fetchReportAssets(reportId);
    const doc=new jsPDF({unit:"mm",format:"a4"});
    const W=210, margin=15, content=W-margin*2;
    doc.setFillColor(11,45,77); doc.rect(0,0,W,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(17); doc.setFont(undefined,"bold"); doc.text("TRANSALMA INTERNACIONAL, S.A.",margin,12);
    doc.setFontSize(9); doc.setFont(undefined,"normal"); doc.text("REPORTE DE MERCANCÍA",margin,19);
    doc.text(String(report.report_number||""),W-margin,19,{align:"right"});
    doc.setTextColor(23,33,43); doc.setFontSize(10); doc.setFont(undefined,"normal");
    let y=38;
    const rows=[
      ["FECHA",report.fecha], ["CONTENEDOR",report.contenedor], ["CONSIGNATARIO",report.consignatario],
      ["BIL/B.L.",report.bl], ["BULTOS",report.bultos], ["CLASE DE MERCANCÍA",report.clase]
    ];
    for(const [label,value] of rows){
      doc.setFont(undefined,"bold"); doc.text(label,margin,y); doc.setFont(undefined,"normal");
      doc.line(margin+43,y+1,W-margin,y+1); doc.text(String(value??""),margin+46,y); y+=9;
    }
    doc.setFont(undefined,"bold"); doc.text("DETALLE DE MERCANCÍA",margin,y); y+=6; doc.setFont(undefined,"normal"); y=addWrapped(doc,report.detalle||"",margin,y,content,5); y+=5;
    doc.setFont(undefined,"bold"); doc.text("OBSERVACIÓN",margin,y); y+=6; doc.setFont(undefined,"normal"); y=addWrapped(doc,report.observacion||"",margin,y,content,5); y+=8;
    doc.setFont(undefined,"bold"); doc.text("RESULTADO",margin,y); doc.setFont(undefined,"normal");
    doc.text(String(report.resultado||""),margin+35,y); y+=10;
    if(report.report_type==="excepcion"){
      doc.setFont(undefined,"bold"); doc.text("INCIDENCIA",margin,y); y+=6; doc.setFont(undefined,"normal"); y=addWrapped(doc,report.incidencias||"",margin,y,content,5); y+=5;
      doc.setFont(undefined,"bold"); doc.text("RECLAMO DENTRO DE 24 HORAS",margin,y); doc.setFont(undefined,"normal"); doc.text(report.reclamo_dentro_24h==null?"":(report.reclamo_dentro_24h?"SÍ":"NO"),margin+60,y); y+=9;
    }
    doc.setFont(undefined,"bold"); doc.text("FIRMAS",margin,y); y+=5;
    const boxW=(content-8)/2, boxH=35;
    for(const [idx,role] of [[0,"transportista"],[1,"bodega"]]){
      const x=margin+idx*(boxW+8); doc.setDrawColor(170,180,190); doc.rect(x,y,boxW,boxH);
      const sg=sigData[role]; if(sg?.dataUrl) doc.addImage(sg.dataUrl,"PNG",x+4,y+3,boxW-8,20);
      doc.setFont(undefined,"normal"); doc.setFontSize(8); doc.text(role==="transportista"?"TRANSPORTISTA":"BODEGA / CHEQUEADOR",x+4,y+27);
      doc.text(String(sg?.signer_name||""),x+4,y+32); doc.setFontSize(10);
    }
    y+=boxH+10;
    if(photoData.length){
      doc.addPage(); y=18; doc.setFontSize(15); doc.setFont(undefined,"bold"); doc.text("FOTOGRAFÍAS DE LA MERCANCÍA",margin,y); y+=8;
      for(const ph of photoData){
        if(y>250){doc.addPage();y=18;}
        const props=doc.getImageProperties(ph.dataUrl); const maxW=content, maxH=100; let iw=maxW, ih=iw*props.height/props.width;
        if(ih>maxH){ih=maxH;iw=ih*props.width/props.height;}
        doc.addImage(ph.dataUrl,"JPEG",margin,y,iw,ih); y+=ih+8;
      }
    }
    const pdfBlob=doc.output("blob");
    const path=`${reportId}/${report.report_number}.pdf`;
    const {error:upError}=await sup.storage.from("report-pdfs").upload(path,pdfBlob,{contentType:"application/pdf",upsert:true});
    if(upError)throw upError;
    const {error:updError}=await sup.from("reports").update({pdf_storage_path:path,status:"PDF_GENERADO"}).eq("id",reportId);
    if(updError)throw updError;
    await sup.rpc("add_report_event",{p_report_id:reportId,p_event_type:"PDF_GENERADO",p_message:`PDF generado para ${report.report_number}`});
    doc.save(`${report.report_number}.pdf`);
  }

  $("generatePdf").onclick=async()=>{
    if(!lastSavedReportId)return;
    const b=$("generatePdf"); b.disabled=true; msg("pdfMessage","Generando PDF…");
    try{await generatePdf(lastSavedReportId); msg("pdfMessage",`PDF ${lastSavedReportNumber} generado correctamente.`);}
    catch(error){console.error(error);msg("pdfMessage",error.message||"No se pudo generar el PDF.");}
    finally{b.disabled=false;}
  };

  async function history(){
    const {data,error}=await sup.from("reports").select("report_number,fecha,report_type,contenedor,consignatario,status,resultado").order("created_at",{ascending:false}).limit(100);
    if(error)return $("historyContent").textContent=error.message;
    if(!data.length)return $("historyContent").textContent="No hay reportes registrados.";
    const esc=v=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[x]));
    $("historyContent").innerHTML="<div class='table-wrap'><table><tr><th>Reporte</th><th>Fecha</th><th>Tipo</th><th>Contenedor</th><th>Consignatario</th><th>Resultado</th><th>Estado</th></tr>"+data.map(r=>`<tr><td>${esc(r.report_number)}</td><td>${esc(r.fecha)}</td><td>${esc(r.report_type)}</td><td>${esc(r.contenedor)}</td><td>${esc(r.consignatario)}</td><td>${esc(r.resultado)}</td><td>${esc(r.status)}</td></tr>`).join("")+"</table></div>";
  }

  sup.auth.onAuthStateChange(()=>session());
  session();
})();
