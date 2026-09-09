import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { requireRole } from '@/lib/session';
export const runtime='nodejs';
export async function POST(req){
  let body;try{body=await req.json();}catch{return NextResponse.json({error:'Dados inválidos.'},{status:400});}
  try{
    const json=await handleUpload({request:req,body,
      onBeforeGenerateToken:async(pathname)=>{
        await requireRole(['ADMIN','COMERCIAL','QUALIDADE','COMPRAS']);
        if(!/^boletins-tinta\/[a-zA-Z0-9._-]+\.pdf$/i.test(pathname))throw new Error('Caminho de boletim PDF inválido.');
        return {allowedContentTypes:['application/pdf'],addRandomSuffix:true,maximumSizeInBytes:50*1024*1024,tokenPayload:null};
      },onUploadCompleted:async()=>{},
    });
    return NextResponse.json(json);
  }catch(e){return NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:e.message==='Forbidden'?403:400});}
}
