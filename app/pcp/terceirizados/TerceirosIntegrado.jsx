'use client';
import {useState} from 'react';
import Romaneios from '@/app/expedicao/terceiros/TerceirizadosClient';
import Legado from './TerceirizadosClient';
export default function TerceirosIntegrado({ops}){const [legado,setLegado]=useState(false);return <><div className="mb-5 flex gap-5 border-b"><button onClick={()=>setLegado(false)} className={'pb-3 '+(!legado?'border-b-2 border-orange-500 font-semibold':'text-gray-500')}>Envios e retornos</button><button onClick={()=>setLegado(true)} className={'pb-3 '+(legado?'border-b-2 border-orange-500 font-semibold':'text-gray-500')}>Peças sem romaneio</button></div>{legado?<Legado/>:<Romaneios ops={ops} focoRetorno/>}</>}
