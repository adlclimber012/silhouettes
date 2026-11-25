import fs from 'fs';
import {feature} from 'topojson-client';
import * as d3 from 'd3-geo';
const t=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-10m.json'));
const nor=feature(t,t.objects.countries).features.find(f=>f.properties.name==='Norway');
let ps=(nor.geometry.type==='Polygon'?[nor.geometry.coordinates]:nor.geometry.coordinates)
 .filter(p=>{const c=d3.geoCentroid({type:'Polygon',coordinates:p});return c[1]>73||(c[0]<0&&c[1]>70)})
 .map(p=>d3.geoArea({type:'Polygon',coordinates:p})>2*Math.PI?p.map(r=>r.slice().reverse()):p);
const geom={type:'MultiPolygon',coordinates:ps};
const [lon,lat]=d3.geoCentroid(geom);
const proj=d3.geoAzimuthalEqualArea().rotate([-lon,-lat]).fitExtent([[8,8],[292,192]],geom);
const d=d3.geoPath(proj).digits(1)(geom);
const c=JSON.parse(fs.readFileSync('countries.json'));
c.push({n:'Svalbard and Jan Mayen',lat:+lat.toFixed(2),lon:+lon.toFixed(2),sw:0.6,d});
fs.mkdirSync('preview',{recursive:true});
fs.writeFileSync('preview/countries.json',JSON.stringify(c));
console.log(ps.length,'polygons',d.length,'chars');
