export type Anchor={sequence:number;kind:string};
export function anchorMetrics(predictions:Anchor[],references:Anchor[]){
 const remaining=new Set(references.map(r=>`${r.sequence}:${r.kind}`));let truePositives=0;
 for(const p of predictions){const key=`${p.sequence}:${p.kind}`;if(remaining.delete(key))truePositives++;}
 const falsePositives=predictions.length-truePositives,falseNegatives=remaining.size;
 const precision=predictions.length?truePositives/predictions.length:null,recall=references.length?truePositives/references.length:null;
 const f1=2*truePositives+falsePositives+falseNegatives?2*truePositives/(2*truePositives+falsePositives+falseNegatives):null;
 return {predictions:predictions.length,references:references.length,truePositives,falsePositives,falseNegatives,precision,recall,f1};
}
