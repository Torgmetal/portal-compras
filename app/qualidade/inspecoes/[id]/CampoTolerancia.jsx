'use client';
export default function CampoTolerancia({value,onChange,disabled=false,label='Tolerância (mm)',onFocus}) {
 return <input type="text" aria-label={label} title="Tolerância em mm. Ex.: ± 3, ± 0,5 ou +5/-2" maxLength={40}
  disabled={disabled} value={value??''} placeholder="± 3" onFocus={onFocus}
  onChange={e=>onChange(e.target.value)}
  onBlur={e=>{const v=e.target.value.trim();if(/^\d+(?:[.,]\d+)?$/.test(v))onChange(`± ${v}`);}}
  className="w-24 shrink-0 text-right text-[12px] font-mono text-torg-dark border border-gray-200 rounded px-1.5 py-1 focus:border-torg-blue focus:ring-1 focus:ring-torg-blue outline-none disabled:bg-gray-50 disabled:text-torg-gray"/>;
}
