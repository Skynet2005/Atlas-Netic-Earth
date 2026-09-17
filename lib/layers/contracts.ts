export type LayerLifecycle='disabled'|'starting'|'ready'|'degraded'|'failed';
export type LayerContext<TViewer=unknown>={viewer:TViewer;requestRender:()=>void};
export type LayerHealth={state:LayerLifecycle;message:string;updatedAt:number|null;count:number};

/**
 * Stable contract for independently owned Atlas-Netic layers.
 * New map intelligence should implement this boundary instead of adding
 * provider, renderer and lifecycle state to the globe shell.
 */
export interface AtlasLayer<TRecord,TViewer=unknown>{
 readonly id:string;
 readonly label:string;
 attach(context:LayerContext<TViewer>):Promise<void>|void;
 enable():Promise<void>|void;
 disable():void;
 update(records:readonly TRecord[]):Promise<void>|void;
 select?(id:string|null):Promise<void>|void;
 health():LayerHealth;
 destroy():void;
}

export interface AtlasDataSource<TRecord,TQuery=void>{
 readonly id:string;
 readonly ttlMs:number;
 readonly staleMs:number;
 fetch(query:TQuery,signal?:AbortSignal):Promise<readonly TRecord[]>;
}
