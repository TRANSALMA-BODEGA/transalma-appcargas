# Archivo histórico de TRANSALMA en Google Drive

## Estado
Preparación en rama de pruebas `feature/transalma-drive-archive`.
No se cambia la rama `main`, la aplicación publicada ni los archivos de Supabase.

## Objetivo
Respaldar los PDF y las fotografías originales de cada reporte en la cuenta Google autorizada por TRANSALMA. Supabase conserva las tablas, usuarios, firmas y relaciones de los reportes.

## Organización acordada
```
TRANSALMA_REPORTES_ARCHIVO/
  PDF_REPORTES/
    LOTE_001_AL_010/
      TI-000001/
      TI-000002/
  FOTOGRAFIAS/
    LOTE_001_AL_010/
      TI-000001/
      TI-000002/
```

Cada carpeta de reporte contendrá el PDF (en PDF_REPORTES) y las fotografías originales (en FOTOGRAFIAS). Los nombres completos TI-000001, etc. se conservan.

## Requisitos antes de implementar OAuth
1. Crear un proyecto en Google Cloud Console para la integración de TRANSALMA.
2. Habilitar Google Drive API.
3. Configurar OAuth consent screen para la cuenta autorizada.
4. Crear un OAuth Client ID de tipo Web application.
5. Autorizar el origen de la aplicación de pruebas y el origen de producción solo cuando se apruebe el despliegue.
6. Entregar únicamente el Client ID público (termina en `.apps.googleusercontent.com`). Nunca compartir Client Secret, contraseñas ni tokens en el chat o en el código del navegador.

Alcance OAuth mínimo previsto: `https://www.googleapis.com/auth/drive.file`. La autorización debe solicitarse explícitamente al usuario desde Google.

## Flujo de respaldo y controles
- Consultar metadatos de reporte, PDF y fotografías vinculadas en Supabase.
- Localizar o crear las carpetas por lote y número de reporte en Drive.
- Copiar el PDF y cada fotografía original sin recomprimir ni transformar.
- Registrar un manifiesto JSON con el número de reporte, nombres, tamaños, MIME types y resultado de verificación.
- Verificar que cada archivo aparezca en Drive con tamaño coincidente y que el manifiesto esté completo.
- Marcar el lote como verificado solo cuando todos sus archivos requeridos estén presentes.
- No borrar archivos de Supabase Storage en esta primera versión.

## Lote piloto
Lote 001–010. Ejecutar primero una prueba con un solo reporte. Continuar con los demás solo después de que el usuario confirme que puede abrir el PDF y las fotografías desde Drive.

## Conteos de referencia revisados
Inventario de Storage: 46 PDF (336.11 MB), 293 fotografías (373.26 MB) y 76 firmas (0.73 MB). Las firmas no se migran en esta tarea.
El inventario detectó objetos sin referencia en las tablas; deben permanecer intactos hasta ser identificados.

## Seguridad
- No exponer service_role keys, OAuth Client Secret ni refresh/access tokens.
- No usar SQL para borrar objetos de Storage.
- No eliminar ni mover objetos durante la fase de respaldo.
- No publicar esta rama en producción ni fusionarla con `main` sin autorización expresa.
