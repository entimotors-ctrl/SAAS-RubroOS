export interface Task{id:number;title:string;description:string;assigned_to:number;assigned_name:string;due_date:string|null;priority:string;status:string;version:number}
export const taskLabels:Record<string,string>={pendiente:'Por confirmar',confirmada:'Confirmada',en_proceso:'En curso',completada:'Completada',cancelada:'Cancelada'};
