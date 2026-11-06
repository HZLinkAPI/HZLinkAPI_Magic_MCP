import {createNoise3D} from 'simplex-noise';

// The home page's 15 px dot grid and noise field, drawn on a small 2D canvas.
export function homeDots(canvas){
  if(!window.CanvasRenderingContext2D)return {refresh(){}};
  const context=canvas.getContext('2d');
  if(!context)return {refresh(){}};
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const noise=createNoise3D(),spacing=15;
  const root=document.documentElement;
  let width=0,height=0,points=[],frame=null,last=0;
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    const scale=Math.min(window.devicePixelRatio||1,1.5);
    if(!w||!h)return false;
    if(w!==width||h!==height||canvas.width!==Math.round(w*scale)){
      width=w;height=h;canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
      context.setTransform(scale,0,0,scale,0,0);
      points=[];
      for(let x=-spacing/2;x<width+spacing;x+=spacing)for(let y=-spacing/2;y<height+spacing;y+=spacing){
        const fade=(Math.sin(x*17+y*0.19)+1)*0.25+0.5;
        points.push({x,y,fade});
      }
    }
    return true;
  }
  function draw(now){
    if(!resize())return;
    const t=motion.matches?0:now/10000;
    const buckets=Array.from({length:6},()=>[]);
    context.clearRect(0,0,width,height);
    for(const {x,y,fade} of points){
      const angle=(noise(x/200,y/200,t)-0.5)*2*Math.PI;
      const length=(noise(x/200,y/200,t*2)+0.5)*5;
      const alpha=(Math.abs(Math.cos(angle))*0.8+0.2)*fade;
      buckets[Math.min(5,Math.floor(alpha*6))].push(x+Math.cos(angle)*length,y+Math.sin(angle)*length);
    }
    context.fillStyle=root.dataset.theme==='light'?'#ccc':'#333';
    for(const [index,positions] of buckets.entries()){
      context.globalAlpha=(index+1)/6;
      context.beginPath();
      for(let i=0;i<positions.length;i+=2){
        context.moveTo(positions[i]+1,positions[i+1]);context.arc(positions[i],positions[i+1],1,0,Math.PI*2);
      }
      context.fill();
    }
    context.globalAlpha=1;
    canvas.dataset.ready='';
  }
  function tick(now){
    frame=null;
    if(document.hidden||motion.matches)return;
    if(now-last>=1000/30){last=now;draw(now);}
    frame=requestAnimationFrame(tick);
  }
  function refresh(){
    if(frame!==null){cancelAnimationFrame(frame);frame=null;}
    if(document.hidden)return;
    draw(performance.now());
    if(!motion.matches)frame=requestAnimationFrame(tick);
  }
  motion.addEventListener('change',refresh);
  window.addEventListener('resize',refresh);
  document.addEventListener('visibilitychange',refresh);
  refresh();
  return {refresh};
}
