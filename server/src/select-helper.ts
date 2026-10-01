/**
 * The select-mode helper injected into an instant artifact's HTML when the
 * admin edit-mode frame asks for it with `?select=1`.
 *
 * Ported from the Dovito hub (web/src/lib/artifact-select-helper.ts). The
 * admin page cannot touch the frame's DOM directly, so a script inside the
 * frame reports what was clicked over postMessage. It does nothing until the
 * parent posts "select-mode:on", trusts only messages whose source is
 * window.parent, and removes its own <script> tag first thing.
 *
 * Injecting it needs no auth: the helper only reports picks to its parent,
 * and every write goes through the Worker, which checks the caller's grants.
 * A private artifact still needs its unlock cookie before anything renders.
 */

export const SELECT_MODE_PARAM = 'select';
export const SELECT_MESSAGE_SOURCE = 'mnc-artifact-select';

export const SELECT_HELPER_SCRIPT = `(function(){
  var SRC=${JSON.stringify(SELECT_MESSAGE_SOURCE)},CAP=1000,CTX=32,on=false,hov=null,sel=[],selBoxes=[],flashBoxes=[],lastEdited=null,flashTimer=null,color="#2563eb",editing=null,editOrig="",rq=false;
try{var me=document.currentScript;if(me&&me.parentNode)me.parentNode.removeChild(me);}catch(e){}
function norm(s){return String(s||"").replace(/\\s+/g," ").trim();}
function post(m){m.source=SRC;m.v=1;try{window.parent.postMessage(m,"*");}catch(e){}}
function pathOf(el){var steps=[];while(el&&el.nodeType===1){var t=String(el.localName||el.tagName).toLowerCase(),n=1,s=el.previousElementSibling;while(s){if(String(s.localName||s.tagName).toLowerCase()===t)n++;s=s.previousElementSibling;}steps.unshift(t+":nth-of-type("+n+")");el=el.parentElement;}return steps.join(" > ");}
function context(el){var before="",after="",w=document.createTreeWalker(document.documentElement,4,null),node;while((node=w.nextNode())){if(el.contains(node))continue;if(el.compareDocumentPosition(node)&2)before+=node.nodeValue;else after+=node.nodeValue;}return{prefix:norm(before).slice(-CTX),suffix:norm(after).slice(0,CTX)};}
function reduced(){try{return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);}catch(e){return false;}}
function mkBox(){var b=document.createElement("div");b.setAttribute("data-mnc-select","");var s=b.style;s.position="fixed";s.pointerEvents="none";s.zIndex="2147483647";s.boxSizing="border-box";s.borderRadius="6px";s.display="none";s.margin="0";document.documentElement.appendChild(b);return b;}
function place(b,el,animate){var r=el.getBoundingClientRect(),s=b.style,first=s.display==="none";s.transition=(first||!animate||reduced())?"none":"top 140ms ease-out, left 140ms ease-out, width 140ms ease-out, height 140ms ease-out";s.left=r.left+"px";s.top=r.top+"px";s.width=r.width+"px";s.height=r.height+"px";s.display="block";}
function showHover(el,flash){if(!hov)hov=mkBox();hov.style.border="2px solid "+color;hov.style.background=flash?"rgba(250,204,21,0.25)":"transparent";place(hov,el,!flash);}
function hideHover(){if(hov){hov.style.display="none";hov.style.transition="none";}}
function drawSel(){while(selBoxes.length<sel.length)selBoxes.push(mkBox());for(var i=0;i<selBoxes.length;i++){var b=selBoxes[i];if(i<sel.length&&sel[i].isConnected){b.style.border="2px solid "+color;b.style.background="color-mix(in srgb, "+color+" 10%, transparent)";place(b,sel[i],false);}else{b.style.display="none";}}}
function setSel(list){sel=list;drawSel();}
function clearPick(){setSel([]);}
function isOurs(el){return !!(el&&el.hasAttribute&&el.hasAttribute("data-mnc-select"));}
function target(e){var el=e.target;if(el&&el.nodeType!==1)el=el.parentElement;if(!el||isOurs(el))return null;return el;}
function inEdit(e){return !!(editing&&e.target&&(e.target===editing||editing.contains(e.target)));}
function swallow(e){if(!on||inEdit(e))return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();}
function over(e){if(!on||editing)return;var el=target(e);if(el)showHover(el,false);}
function describe(el){var c=context(el),r=el.getBoundingClientRect();return{cssPath:pathOf(el),tag:String(el.localName||el.tagName).toLowerCase(),editable:el.children.length===0,quote:{prefix:c.prefix,exact:norm(el.textContent).slice(0,CAP),suffix:c.suffix},rect:{x:r.left,y:r.top,width:r.width,height:r.height}};}
function postSel(extra){if(sel.length===0){post({type:"pick",items:[]});return;}var items=[];for(var i=0;i<sel.length;i++)items.push(describe(sel[i]));var m=items[0],out={type:"pick",items:items,cssPath:m.cssPath,tag:m.tag,editable:m.editable,quote:m.quote,rect:m.rect};if(extra){for(var k in extra)out[k]=extra[k];}post(out);}
function pickFrom(el,extra){setSel([el]);postSel(extra);}
function toggle(el){var i=sel.indexOf(el),next=sel.slice();if(i>=0)next.splice(i,1);else{for(var j=next.length-1;j>=0;j--){if(next[j].contains(el)||el.contains(next[j]))next.splice(j,1);}next.push(el);}setSel(next);postSel(null);}
function click(e){if(!on||inEdit(e))return;swallow(e);if(editing)return;var el=target(e);if(!el)return;if(e.shiftKey)toggle(el);else pickFrom(el,null);}
function dbl(e){if(!on||inEdit(e))return;swallow(e);if(editing)return;try{window.getSelection().removeAllRanges();}catch(x){}var el=target(e);if(el)pickFrom(el,{startEdit:true,caret:{x:e.clientX,y:e.clientY}});}
function find(m){var el=null;try{el=document.querySelector(m.cssPath);}catch(e){}var q=m.quote&&m.quote.exact?norm(m.quote.exact):"";if(el&&(!q||norm(el.textContent).slice(0,CAP)===q))return el;if(!q)return el;var all=document.getElementsByTagName(m.tag||"*");for(var i=all.length-1;i>=0;i--){if(norm(all[i].textContent).slice(0,CAP)===q)return all[i];}return el;}
function highlight(m){var ts=m.targets&&m.targets.length?m.targets:[m],els=[];for(var i=0;i<ts.length;i++){var f=find(ts[i]);if(f)els.push(f);}if(!els.length){post({type:"highlight-result",found:false});return;}try{els[0].scrollIntoView({block:"center"});}catch(e){}for(var k=0;k<flashBoxes.length;k++)flashBoxes[k].style.display="none";while(flashBoxes.length<els.length)flashBoxes.push(mkBox());for(var n=0;n<els.length;n++){var b=flashBoxes[n];b.style.border="2px solid "+color;b.style.background="rgba(250,204,21,0.25)";place(b,els[n],false);}if(flashTimer)clearTimeout(flashTimer);flashTimer=setTimeout(function(){for(var q=0;q<flashBoxes.length;q++)flashBoxes[q].style.display="none";},2000);var r=els[0].getBoundingClientRect();post({type:"highlight-result",found:true,count:els.length,rect:{x:r.left,y:r.top,width:r.width,height:r.height}});}
function endEdit(restore){if(!editing)return;var el=editing;editing=null;if(restore)el.textContent=editOrig;el.removeAttribute("contenteditable");}
function caretAt(el,p){var rg=null;try{if(p&&document.caretRangeFromPoint)rg=document.caretRangeFromPoint(p.x,p.y);else if(p&&document.caretPositionFromPoint){var cp=document.caretPositionFromPoint(p.x,p.y);if(cp){rg=document.createRange();rg.setStart(cp.offsetNode,cp.offset);rg.collapse(true);}}}catch(e){rg=null;}if(!rg||!el.contains(rg.startContainer)){rg=document.createRange();rg.selectNodeContents(el);rg.collapse(false);}var sel=window.getSelection();sel.removeAllRanges();sel.addRange(rg);}
function startEdit(m){var el=find(m);if(!el){post({type:"edit:refused",reason:"missing"});return;}if(el.children.length>0){post({type:"edit:refused",reason:"children"});return;}endEdit(true);hideHover();editing=el;editOrig=el.textContent;try{el.contentEditable="plaintext-only";}catch(e){}if(el.contentEditable!=="plaintext-only")el.contentEditable="true";setSel([el]);try{el.focus();caretAt(el,m.caret);}catch(e){}post({type:"edit:started"});}
function commitEdit(){if(!editing)return;var el=editing,t=el.textContent;lastEdited=el;endEdit(false);post({type:"edit:text",text:t});}
function saved(){var el=lastEdited;clearPick();if(!el||!el.isConnected)return;var r=el.getBoundingClientRect(),p=document.createElement("div");p.setAttribute("data-mnc-select","");p.textContent="Saved";var s=p.style;s.position="fixed";s.pointerEvents="none";s.zIndex="2147483647";s.left=Math.max(4,r.right-52)+"px";s.top=Math.max(4,r.top-24)+"px";s.padding="2px 8px";s.borderRadius="6px";s.font="500 12px/18px system-ui,sans-serif";s.color="#fff";s.background=color;s.opacity="1";s.transition=reduced()?"none":"opacity 300ms ease-out";document.documentElement.appendChild(p);setTimeout(function(){s.opacity="0";},900);setTimeout(function(){if(p.parentNode)p.parentNode.removeChild(p);},reduced()?1200:1300);}
function key(e){if(editing){if(e.key==="Escape"){e.preventDefault();endEdit(true);post({type:"edit:cancel"});return;}if(e.key==="Enter"){if(e.isComposing||e.keyCode===229)return;e.preventDefault();post({type:"edit:save-request"});return;}return;}if(on&&e.key==="Escape")post({type:"escape"});}
function beforeinput(e){if(!inEdit(e))return;var t=String(e.inputType||"");if(t==="insertParagraph"||t==="insertLineBreak"||t.indexOf("format")===0)e.preventDefault();}
function paste(e){if(!inEdit(e))return;e.preventDefault();var d=e.clipboardData||window.clipboardData,t=d?String(d.getData("text/plain")||"").replace(/\\s+/g," "):"";try{if(!document.execCommand("insertText",false,t))throw 0;}catch(x){var sel=window.getSelection();if(sel&&sel.rangeCount){var rg=sel.getRangeAt(0);rg.deleteContents();rg.insertNode(document.createTextNode(t));rg.collapse(false);}}}
function drop(e){if(inEdit(e))e.preventDefault();}
function rectOf(el){var r=el.getBoundingClientRect();return{x:r.left,y:r.top,width:r.width,height:r.height};}
function postRect(){rq=false;var el=sel.length?sel[sel.length-1]:null;if(el&&el.isConnected)post({type:"pick:rect",rect:rectOf(el)});}
function onScroll(){if(on&&!editing)hideHover();if(sel.length){drawSel();if(!rq){rq=true;try{requestAnimationFrame(postRect);}catch(e){postRect();}}}}
function setOn(v){on=v;if(!v){endEdit(true);hideHover();clearPick();}}
window.addEventListener("message",function(e){if(e.source!==window.parent)return;var m=e.data;if(!m||m.source!==SRC||m.v!==1)return;try{if(typeof m.color==="string")color=m.color;if(m.type==="select-mode:on")setOn(true);else if(m.type==="select-mode:off")setOn(false);else if(m.type==="highlight")highlight(m);else if(m.type==="edit:start")startEdit(m);else if(m.type==="edit:commit")commitEdit();else if(m.type==="edit:cancel")endEdit(true);else if(m.type==="pick:clear")clearPick();else if(m.type==="saved")saved();}catch(err){}});
window.addEventListener("mouseover",over,true);
window.addEventListener("click",click,true);
window.addEventListener("dblclick",dbl,true);
window.addEventListener("mousedown",swallow,true);
window.addEventListener("mouseup",swallow,true);
window.addEventListener("pointerdown",swallow,true);
window.addEventListener("pointerup",swallow,true);
window.addEventListener("submit",swallow,true);
window.addEventListener("keydown",key,true);
window.addEventListener("beforeinput",beforeinput,true);
window.addEventListener("paste",paste,true);
window.addEventListener("drop",drop,true);
window.addEventListener("scroll",onScroll,true);window.addEventListener("resize",onScroll);
window.addEventListener("resize",onScroll);
post({type:"ready"});
})();`;

/** Insert the helper just before the last </body>, or at the end when there is none. */
export function injectSelectHelper(html: string): string {
    const tag = `<script data-mnc-select-helper>${SELECT_HELPER_SCRIPT}</script>`;
    const i = html.toLowerCase().lastIndexOf('</body');
    if (i === -1) return html + tag;
    return html.slice(0, i) + tag + html.slice(i);
}
