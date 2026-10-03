(()=>{
  const c=window.TRANSALMA_CONFIG;
  const sup=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const msg=(id,t)=>$(id).textContent=t||"";
  const today=()=>new Date().toISOString().slice(0,10);

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
      msg("formMessage",`Reporte ${data.report_number} guardado con ${files.length} foto(s) y 2 firmas.`);
      $("reportForm").reset();
      setDate();
      clearSignature("sigTransportista");clearSignature("sigBodega");
      $("photoPreview").innerHTML="";
    }catch(error){
      console.error(error);
      msg("formMessage",error.message||"No se pudo guardar el reporte.");
    }finally{saveButton.disabled=false;}
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
