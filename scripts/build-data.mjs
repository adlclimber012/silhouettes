import fs from 'fs';
import {feature} from 'topojson-client';
import * as d3 from 'd3-geo';
const load=n=>feature(JSON.parse(fs.readFileSync(`node_modules/world-atlas/countries-${n}.json`)),JSON.parse(fs.readFileSync(`node_modules/world-atlas/countries-${n}.json`)).objects.countries).features;
const f50=load('50m'), f10=load('10m');
const by10=Object.fromEntries(f10.map(f=>[f.properties.name,f]));
const keep=new Set(`Zimbabwe|Zambia|Yemen|Vietnam|Venezuela|Vatican|Vanuatu|Uzbekistan|Uruguay|Micronesia|Marshall Is.|United States of America|United Kingdom|United Arab Emirates|Ukraine|Uganda|Turkmenistan|Turkey|Tunisia|Trinidad and Tobago|Tonga|Togo|Timor-Leste|Thailand|Tanzania|Tajikistan|Taiwan|Syria|Switzerland|Sweden|eSwatini|Suriname|S. Sudan|Sudan|Sri Lanka|Spain|South Korea|South Africa|Somalia|Solomon Is.|Slovakia|Slovenia|Singapore|Sierra Leone|Seychelles|Serbia|Senegal|Saudi Arabia|São Tomé and Principe|San Marino|Samoa|St. Vin. and Gren.|Saint Lucia|St. Kitts and Nevis|Rwanda|Russia|Romania|Qatar|Portugal|Poland|Philippines|Peru|Paraguay|Papua New Guinea|Panama|Palau|Pakistan|Oman|Norway|North Korea|Nigeria|Niger|Nicaragua|New Zealand|Netherlands|Nepal|Nauru|Namibia|Mozambique|Morocco|W. Sahara|Montenegro|Mongolia|Moldova|Monaco|Mexico|Mauritius|Mauritania|Malta|Mali|Maldives|Malaysia|Malawi|Madagascar|Macedonia|Luxembourg|Lithuania|Liechtenstein|Libya|Liberia|Lesotho|Lebanon|Latvia|Laos|Kyrgyzstan|Kuwait|Kosovo|Kiribati|Kenya|Kazakhstan|Jordan|Japan|Jamaica|Italy|Israel|Palestine|Ireland|Iraq|Iran|Indonesia|India|Iceland|Hungary|Honduras|Haiti|Guyana|Guinea-Bissau|Guinea|Guatemala|Grenada|Greece|Ghana|Germany|Georgia|Gambia|Gabon|France|Finland|Fiji|Ethiopia|Estonia|Eritrea|Eq. Guinea|El Salvador|Egypt|Ecuador|Dominican Rep.|Dominica|Djibouti|Greenland|Denmark|Czechia|Cyprus|Cuba|Croatia|Côte d'Ivoire|Costa Rica|Dem. Rep. Congo|Congo|Comoros|Colombia|China|Chile|Chad|Central African Rep.|Cabo Verde|Canada|Cameroon|Cambodia|Myanmar|Burundi|Burkina Faso|Bulgaria|Brunei|Brazil|Botswana|Bosnia and Herz.|Bolivia|Bhutan|Benin|Belize|Belgium|Belarus|Barbados|Bangladesh|Bahrain|Bahamas|Azerbaijan|Austria|Australia|Armenia|Argentina|Antigua and Barb.|Angola|Andorra|Algeria|Albania|Afghanistan`.split('|'));
const rename={'United States of America':'United States','eSwatini':'Eswatini','S. Sudan':'South Sudan','Solomon Is.':'Solomon Islands','Marshall Is.':'Marshall Islands','São Tomé and Principe':'São Tomé and Príncipe','St. Vin. and Gren.':'Saint Vincent and the Grenadines','St. Kitts and Nevis':'Saint Kitts and Nevis','W. Sahara':'Western Sahara','Macedonia':'North Macedonia','Eq. Guinea':'Equatorial Guinea','Dominican Rep.':'Dominican Republic','Dem. Rep. Congo':'DR Congo','Central African Rep.':'Central African Republic','Bosnia and Herz.':'Bosnia and Herzegovina','Antigua and Barb.':'Antigua and Barbuda','Vatican':'Vatican City','Micronesia':'Micronesia'};
const SMALL=20000; // km2
const R=6371;
function polys(g){return g.type==='Polygon'?[g.coordinates]:g.coordinates;}
function special(name,p){
  const c=d3.geoCentroid({type:'Polygon',coordinates:p});
  if(name==='France') return c[0]>-6&&c[0]<10&&c[1]>41&&c[1]<52;
  if(name==='Netherlands') return c[0]>0;
  if(name==='Norway') return c[1]<73;
  if(name==='United States of America') return c[1]<50;
  if(name==='Russia') return true;
  if(name==='New Zealand') return true;
  return true;
}
function rdp(pts,e){
  if(pts.length<3) return pts;
  let [ax,ay]=pts[0],[bx,by]=pts[pts.length-1];
  let dm=0,im=0;const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy);
  for(let i=1;i<pts.length-1;i++){
    const [px,py]=pts[i];
    const dd=L?Math.abs(dy*px-dx*py+bx*ay-by*ax)/L:Math.hypot(px-ax,py-ay);
    if(dd>dm){dm=dd;im=i;}
  }
  if(dm>e){const l=rdp(pts.slice(0,im+1),e),r=rdp(pts.slice(im),e);return l.slice(0,-1).concat(r);}
  return [pts[0],pts[pts.length-1]];
}
function simplify(d,e){
  const subs=d.split('M').filter(Boolean);
  let o='',mxe=0;
  for(const s of subs){
    let pts=s.replace('Z','').split('L').map(p=>p.split(',').map(Number));
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
    mxe=Math.max(mxe,w,h);
    if(e>0.1&&Math.max(w,h)<1.2&&subs.length>1) continue;
    pts=rdp(pts,e);
    if(pts.length<3&&subs.length>1) continue;
    o+='M'+pts.map(p=>p[0]+','+p[1]).join('L')+'Z';
  }
  return {o,mxe};
}
const out=[];
for(const f of f50){
  const n=f.properties.name; if(!keep.has(n)) continue;
  const areaKm=d3.geoArea(f)*R*R;
  let src=(areaKm<SMALL&&by10[n])?by10[n]:f;
  if(n==='Vatican') src=f;
  let ps=polys(src.geometry).filter(p=>special(n,p)).map(p=>d3.geoArea({type:'Polygon',coordinates:p})>2*Math.PI?p.map(r=>r.slice().reverse()):p);
  const areas=ps.map(p=>d3.geoArea({type:'Polygon',coordinates:p}));
  const mx=Math.max(...areas);
  const thr=areaKm<SMALL?0.0:0.03;
  ps=ps.filter((p,i)=>areas[i]>=mx*thr);
  const geom={type:'MultiPolygon',coordinates:ps};
  const [lon,lat]=d3.geoCentroid(geom);
  const proj=d3.geoAzimuthalEqualArea().rotate([-lon,-lat]).fitExtent([[8,8],[292,192]],geom);
  const path=d3.geoPath(proj).digits(1);
  let d=path(geom);
  // drop consecutive duplicate points
  d=d.replace(/([ML])([\d.\-]+),([\d.\-]+)/g,'$1$2,$3').replace(/(?<=[\dZ])(?=[ML])/g,'');
  const sr=simplify(d,areaKm<SMALL?0.05:0.3);
  const sw=sr.mxe<12?3.2:sr.mxe<30?1.8:0.6;
  out.push({n:rename[n]||n,lat:+lat.toFixed(2),lon:+lon.toFixed(2),sw,d:sr.o});
}
out.sort((a,b)=>a.n.localeCompare(b.n));
fs.writeFileSync('countries.json',JSON.stringify(out));
console.log(out.length,(fs.statSync('countries.json').size/1024).toFixed(0)+'KB');
console.log(out.filter(x=>!x.d||x.d.length<20).map(x=>x.n));

// Rewrite in the shipped format: one JSON array, one record per line (clean git diffs)
fs.writeFileSync('countries.json','[\n'+out.map(x=>JSON.stringify(x)).join(',\n')+'\n]\n');
