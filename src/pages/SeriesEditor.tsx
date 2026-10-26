import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, formatDate, type Booking } from "../api";
type Series={id:string;frequency:"weekly"|"fortnightly";bookings:Booking[]};
type Edit={id:string;date:string;time:string;frequency:string;count:number;requestId:string;versions:{id:string;version:number}[]};
export default function SeriesEditor(){
 const cache=useQueryClient(),[selected,setSelected]=useState(""),[notice,setNotice]=useState("");
 const pending=useRef<{body:string;requestId:string}|null>(null);
 const query=useQuery({queryKey:["admin","series"],queryFn:()=>api<Series[]>("/admin/series")});
 const current=query.data?.find(row=>row.id===selected)??query.data?.[0];
 const edit=useMutation({
  mutationFn:(data:Edit)=>{const {id,...body}=data;return api<{id:string;bookings:Booking[]}>("/admin/series/"+id,{method:"PUT",body:JSON.stringify(body)});},
  onSuccess:data=>{setSelected(data.id);setNotice(data.bookings.length+" encontros futuros atualizados. O histórico foi preservado.");pending.current=null;void cache.invalidateQueries({queryKey:["admin"]});void cache.invalidateQueries({queryKey:["availability"]});},
 });
 return <section className="hours" aria-label="Edição de séries">
  <h3>Editar uma série combinada</h3>
  <p>A alteração substitui somente os encontros confirmados futuros. Um conflito impede a mudança inteira. Revise data, horário, frequência e quantidade antes de confirmar.</p>
  {query.isSuccess&&!query.data.length&&<p>Nenhuma série recorrente futura para editar.</p>}
  {current&&<>
   <label>Série para editar<select value={current.id} onChange={event=>{setSelected(event.target.value);setNotice("");edit.reset();pending.current=null;}}>
    {query.data?.map(row=><option key={row.id} value={row.id}>{row.bookings[0].name+" — "+formatDate(row.bookings[0].date)+" · "+row.bookings.length+" futuros"}</option>)}
   </select></label>
   <form key={current.id+current.bookings.map(b=>b.id+":"+b.version).join(",")} onSubmit={event=>{
    event.preventDefault();const fields=new FormData(event.currentTarget);
    const data={id:current.id,date:String(fields.get("date")),time:String(fields.get("time")),frequency:String(fields.get("frequency")),count:Number(fields.get("count")),versions:current.bookings.map(b=>({id:b.id,version:b.version}))};
    const body=JSON.stringify(data);if(pending.current?.body!==body)pending.current={body,requestId:crypto.randomUUID()};
    if(window.confirm("Substituir "+current.bookings.length+" encontros futuros por "+data.count+"? Os anteriores serão cancelados e os novos só serão confirmados se a mudança inteira puder ser reservada."))edit.mutate({...data,requestId:pending.current.requestId});
   }}>
    <label>Primeira nova data<input name="date" type="date" defaultValue={current.bookings[0].date} required/></label>
    <label>Novo horário da série<input name="time" type="time" step="1800" defaultValue={current.bookings[0].time} required/></label>
    <label>Nova frequência<select name="frequency" defaultValue={current.frequency}><option value="weekly">Semanal</option><option value="fortnightly">Quinzenal</option></select></label>
    <label>Quantidade futura de encontros<input name="count" type="number" min="1" max="26" defaultValue={current.bookings.length} required/></label>
    <button className="primary" disabled={edit.isPending}>Atualizar encontros futuros</button>
   </form>
  </>}
  {notice&&<p role="status">{notice}</p>}
  {(query.isError||edit.isError)&&<p role="alert">{errorMessage(query.error??edit.error)}</p>}
  {edit.isError&&edit.variables&&<button disabled={edit.isPending} onClick={()=>edit.mutate(edit.variables!)}>Repetir a mesma tentativa</button>}
 </section>;
}
