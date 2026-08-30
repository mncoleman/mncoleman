/**
 * Regenerates public/artifacts/world-factbook-explorer.html from the live
 * factbook.json mirror (https://github.com/factbook/factbook.json) so the
 * artifact tracks the CIA World Factbook on every daily site build.
 *
 * Failure policy: this is auxiliary content with a committed fallback, so a
 * clone/parse failure must NOT fail the build — it warns and keeps the
 * existing file. It only throws if there is no existing file to fall back to.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const OUT = path.join(process.cwd(), 'public', 'artifacts', 'world-factbook-explorer.html');
const TEMPLATE = path.join(process.cwd(), 'scripts', 'factbook-template.html');
const REPO = 'https://github.com/factbook/factbook.json.git';

const REGION_NAMES: Record<string, string> = {
  africa: 'Africa', antarctica: 'Antarctica', 'australia-oceania': 'Oceania',
  'central-america-n-caribbean': 'Central America & Caribbean', 'central-asia': 'Central Asia',
  'east-n-southeast-asia': 'East & Southeast Asia', europe: 'Europe',
  'middle-east': 'Middle East', 'north-america': 'North America', oceans: 'Oceans',
  'south-america': 'South America', 'south-asia': 'South Asia', world: 'World',
};

const NAME_FIXES: Record<string, string> = {
  ee: 'European Union', xx: 'World', oo: 'Southern Ocean', xo: 'Indian Ocean',
  xq: 'Arctic Ocean', zh: 'Atlantic Ocean', zn: 'Pacific Ocean', sv: 'Svalbard',
};

// GEC (FIPS 10-4) -> ISO 3166-1 alpha-2, for emoji flags. null = no renderable flag.
const GEC_TO_ISO: Record<string, string | null> = {
  aa:'AW',ac:'AG',ae:'AE',af:'AF',ag:'DZ',aj:'AZ',al:'AL',am:'AM',an:'AD',ao:'AO',aq:'AS',ar:'AR',as:'AU',au:'AT',av:'AI',ay:'AQ',
  ba:'BH',bb:'BB',bc:'BW',bd:'BM',be:'BE',bf:'BS',bg:'BD',bh:'BZ',bk:'BA',bl:'BO',bm:'MM',bn:'BJ',bo:'BY',bp:'SB',br:'BR',bt:'BT',bu:'BG',bv:'BV',bx:'BN',by:'BI',
  ca:'CA',cb:'KH',cd:'TD',ce:'LK',cf:'CG',cg:'CD',ch:'CN',ci:'CL',cj:'KY',ck:'CC',cm:'CM',cn:'KM',co:'CO',cq:'MP',cs:'CR',ct:'CF',cu:'CU',cv:'CV',cw:'CK',cy:'CY',
  da:'DK',dj:'DJ',do:'DM',dr:'DO',ec:'EC',ee:'EU',eg:'EG',ei:'IE',ek:'GQ',en:'EE',er:'ER',es:'SV',et:'ET',ez:'CZ',
  fg:'GF',fi:'FI',fj:'FJ',fk:'FK',fm:'FM',fo:'FO',fp:'PF',fr:'FR',fs:'TF',
  ga:'GM',gb:'GA',gg:'GE',gh:'GH',gi:'GI',gj:'GD',gk:'GG',gl:'GL',gm:'DE',gp:'GP',gq:'GU',gr:'GR',gt:'GT',gv:'GN',gy:'GY',gz:'PS',
  ha:'HT',hk:'HK',hm:'HM',ho:'HN',hr:'HR',hu:'HU',
  ic:'IS',id:'ID',im:'IM',in:'IN',io:'IO',ir:'IR',is:'IL',it:'IT',iv:'CI',iz:'IQ',
  ja:'JP',je:'JE',jm:'JM',jn:'SJ',jo:'JO',
  ke:'KE',kg:'KG',kn:'KP',kr:'KI',ks:'KR',kt:'CX',ku:'KW',kv:null,kz:'KZ',
  la:'LA',le:'LB',lg:'LV',lh:'LT',li:'LR',lo:'SK',ls:'LI',lt:'LS',lu:'LU',ly:'LY',
  ma:'MG',mb:'MQ',mc:'MO',md:'MD',mf:'YT',mg:'MN',mh:'MS',mi:'MW',mj:'ME',mk:'MK',ml:'ML',mn:'MC',mo:'MA',mp:'MU',mr:'MR',mt:'MT',mu:'OM',mv:'MV',mx:'MX',my:'MY',mz:'MZ',
  nc:'NC',ne:'NU',nf:'NF',ng:'NE',nh:'VU',ni:'NG',nl:'NL',nn:'SX',no:'NO',np:'NP',nr:'NR',ns:'SR',nu:'NI',nz:'NZ',
  od:'SS',pa:'PY',pc:'PN',pe:'PE',pk:'PK',pl:'PL',pm:'PA',po:'PT',pp:'PG',ps:'PW',pu:'GW',
  qa:'QA',re:'RE',ri:'RS',rm:'MH',rn:'MF',ro:'RO',rp:'PH',rq:'PR',rs:'RU',rw:'RW',
  sa:'SA',sb:'PM',sc:'KN',se:'SC',sf:'ZA',sg:'SN',sh:'SH',si:'SI',sk:'SG',sl:'SL',sm:'SM',sn:'SG',so:'SO',sp:'ES',st:'LC',su:'SD',sv:'SJ',sw:'SE',sx:'GS',sy:'SY',sz:'CH',
  tb:'BL',td:'TT',th:'TH',ti:'TJ',tk:'TC',tl:'TK',tn:'TO',to:'TG',tp:'ST',ts:'TN',tt:'TL',tu:'TR',tv:'TV',tw:'TW',tx:'TM',tz:'TZ',
  uc:'CW',ug:'UG',uk:'GB',up:'UA',us:'US',uv:'BF',uy:'UY',uz:'UZ',
  vc:'VC',ve:'VE',vi:'VG',vm:'VN',vq:'VI',vt:'VA',
  wa:'NA',we:'PS',wf:'WF',wi:'EH',ws:'WS',wz:'SZ',ym:'YE',za:'ZM',zi:'ZW',
};

// ISO 3166-1 alpha-2 -> numeric id of the country's shape in scripts/factbook-world-map.json
// (Natural Earth 110m via world-atlas; only ids that exist in that file are listed)
const ISO2_TO_MAP: Record<string, string> = {
  AE:'784',AF:'004',AL:'008',AM:'051',AO:'024',AQ:'010',AR:'032',AT:'040',AU:'036',AZ:'031',BA:'070',BD:'050',BE:'056',BF:'854',BG:'100',BI:'108',BJ:'204',BN:'096',BO:'068',BR:'076',BS:'044',BT:'064',BW:'072',BY:'112',BZ:'084',
  CA:'124',CD:'180',CF:'140',CG:'178',CH:'756',CI:'384',CL:'152',CM:'120',CN:'156',CO:'170',CR:'188',CU:'192',CY:'196',CZ:'203',DE:'276',DJ:'262',DK:'208',DO:'214',DZ:'012',EC:'218',EE:'233',EG:'818',EH:'732',ER:'232',ES:'724',ET:'231',
  FI:'246',FJ:'242',FK:'238',FR:'250',GA:'266',GB:'826',GE:'268',GH:'288',GL:'304',GM:'270',GN:'324',GQ:'226',GR:'300',GT:'320',GW:'624',GY:'328',HN:'340',HR:'191',HT:'332',HU:'348',ID:'360',IE:'372',IL:'376',IN:'356',IQ:'368',IR:'364',IS:'352',IT:'380',
  JM:'388',JO:'400',JP:'392',KE:'404',KG:'417',KH:'116',KP:'408',KR:'410',KW:'414',KZ:'398',LA:'418',LB:'422',LK:'144',LR:'430',LS:'426',LT:'440',LU:'442',LV:'428',LY:'434',MA:'504',MD:'498',ME:'499',MG:'450',MK:'807',ML:'466',MM:'104',MN:'496',MR:'478',MW:'454',MX:'484',MY:'458',MZ:'508',
  NA:'516',NC:'540',NE:'562',NG:'566',NI:'558',NL:'528',NO:'578',NP:'524',NZ:'554',OM:'512',PA:'591',PE:'604',PG:'598',PH:'608',PK:'586',PL:'616',PR:'630',PS:'275',PT:'620',PY:'600',QA:'634',RO:'642',RS:'688',RU:'643',RW:'646',
  SA:'682',SB:'090',SD:'729',SE:'752',SI:'705',SK:'703',SL:'694',SN:'686',SO:'706',SR:'740',SS:'728',SV:'222',SY:'760',SZ:'748',TD:'148',TF:'260',TG:'768',TH:'764',TJ:'762',TL:'626',TM:'795',TN:'788',TR:'792',TT:'780',TW:'158',TZ:'834',
  UA:'804',UG:'800',US:'840',UY:'858',UZ:'860',VE:'862',VN:'704',VU:'548',YE:'887',ZA:'710',ZM:'894',ZW:'716',
};
// shapes without an ISO2 in the map source, keyed by factbook GEC code
const GEC_TO_MAP: Record<string, string> = { kv: 'undefined' /* Kosovo ships with a null id in world-atlas */ };

const TITLE_WORDS = new Set([
  'president','prime','minister','premier','king','queen','sultan','emir','amir',
  'chancellor','supreme','leader','grand','duke','duchess','prince','princess','crown',
  'pope','emperor','chairman','chairperson','chief','executive','governor','general',
  'governor-general','captain','regent','regents','co-prince','taoiseach','federal',
  'state','interim','transitional','acting','first','secretary','administrator','mayor',
  'bailiff','lord','of','the','council','presidency','head','commissioner','prefect',
  'high','ulu',"o'o",'monarch','co-chairs','co-chair','transition','gnu',
]);
const PARTICLES = new Set(['bin','bint','al','ibn','van','von','der','de','del','da','dos','el','ter','ten','abd','abdel','abu']);
const ROMAN_RE = /^[IVX]+$/;

type FBValue = string | { [k: string]: FBValue } | FBValue[] | null | undefined;

const ACCENTS: Record<string, string> = {
  acute: '́', grave: '̀', circ: '̂', uml: '̈', tilde: '̃', cedil: '̧', ring: '̊', caron: '̌',
};
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å',
  eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ', deg: '°', frac12: '½', frac14: '¼', micro: 'µ', middot: '·', sect: '§',
};
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([A-Za-z])(acute|grave|circ|uml|tilde|cedil|ring|caron);/g, (_, ch, acc) => (ch + ACCENTS[acc]).normalize('NFC'))
    .replace(/&([A-Za-z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
function clean(s: unknown): string | null {
  if (s == null) return null;
  let t = String(s)
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t || null;
}

function norm(v: FBValue): string | Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === 'string') return clean(v);
  if (Array.isArray(v)) {
    const parts = v.map(norm).filter((p): p is string => typeof p === 'string');
    return parts.join('; ') || null;
  }
  const keys = Object.keys(v);
  if (keys.every((k) => k === 'text' || k === 'note')) {
    const t = clean((v as Record<string, FBValue>).text);
    const n = clean((v as Record<string, FBValue>).note);
    return t && n ? `${t}\n${n}` : t || n;
  }
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const s = norm((v as Record<string, FBValue>)[k]);
    if (s) out[clean(k) ?? k] = s;
  }
  return Object.keys(out).length ? out : null;
}

function get(d: FBValue, ...pathKeys: string[]): string | Record<string, unknown> | null {
  let cur: FBValue = d;
  for (const p of pathKeys) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return null;
    const obj = cur as Record<string, FBValue>;
    const hit = p in obj ? p : Object.keys(obj).find((k) => k.trim() === p);
    if (hit === undefined) return null;
    cur = obj[hit];
  }
  return norm(cur);
}

function flat(v: string | Record<string, unknown> | null): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  const lines = Object.entries(v)
    .map(([k, s]) => {
      const f = flat(s as string | Record<string, unknown>);
      return f ? `${k}: ${f}` : null;
    })
    .filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

function isCapsWord(w: string): boolean {
  return w.split('-').some((p) => {
    const letters = p.replace(/[^A-Za-z]/g, '');
    return letters.length > 1 && letters === letters.toUpperCase();
  });
}

function leaderName(text: string | null): string | null {
  if (!text) return null;
  let first = text.split('\n')[0];
  first = first.split(/\s*\((?:since|from|sworn|elected|appointed|reelected|20\d\d|19\d\d)/)[0];
  first = first.split(/; | and also | represented by | is | serves /)[0].trim();
  const words = first.split(/\s+/).map((w) => w.replace(/^,|,$/g, '')).filter(Boolean);
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    const core = words[i].replace(/[^A-Z]/g, '');
    if (isCapsWord(words[i]) && !(ROMAN_RE.test(core) && i === words.length - 1)) { idx = i; break; }
  }
  if (idx < 0) return null;
  let j = idx;
  while (j > 0) {
    const prev = words[j - 1];
    const low = prev.toLowerCase().replace(/\.$/, '');
    if (TITLE_WORDS.has(low) || ['and', 'sir', 'dame'].includes(prev.toLowerCase()) || prev.includes('(')) break;
    if (/^[A-Z]/.test(prev) && !isCapsWord(prev)) j--;
    else break;
  }
  let k = idx;
  while (k + 1 < words.length) {
    const nxt = words[k + 1];
    if (nxt.includes('(')) break;
    const core = nxt.replace(/[^A-Za-z]/g, '');
    const low = nxt.toLowerCase();
    const particle = PARTICLES.has(low) || PARTICLES.has(low.split('-')[0]);
    if (isCapsWord(nxt) || particle || (/^[A-Z]/.test(nxt) && /^[A-Za-z]+$/.test(core))) {
      if (['and', 'the', 'of'].includes(low)) break;
      k++;
    } else break;
  }
  const picked = words.slice(j, k + 1);
  while (picked.length && TITLE_WORDS.has(picked[0].toLowerCase().replace(/\.$/, ''))) picked.shift();
  if (!picked.length) return null;
  const fixed = picked.map((w, i) => {
    const core = w.replace(/[^A-Z]/g, '');
    if (isCapsWord(w) && !(ROMAN_RE.test(core) && i === picked.length - 1)) {
      return w.split('-').map((p) => {
        const letters = p.replace(/[^A-Za-z]/g, '');
        return letters.length > 1 && letters === letters.toUpperCase()
          ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
          : p;
      }).join('-');
    }
    return w;
  });
  const name = fixed.join(' ').replace(/^[\s\-,]+|[\s\-,]+$/g, '');
  if (!name || !/^[A-ZÀ-Þ]/.test(name) || name.length < 3 || name.toLowerCase().includes('vacant')) return null;
  return name;
}

function flagEmoji(iso2: string | null | undefined): string | null {
  if (!iso2 || iso2.length !== 2) return null;
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function prune(x: unknown): unknown {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      if (v != null && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0)) out[k] = prune(v);
    }
    return Object.keys(out).length ? out : null;
  }
  return x;
}

function buildDataset(fbDir: string) {
  const countries: Record<string, unknown>[] = [];
  for (const regionDir of fs.readdirSync(fbDir).sort()) {
    if (regionDir === 'meta' || regionDir.startsWith('.')) continue;
    const full = path.join(fbDir, regionDir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full).sort()) {
      if (!file.endsWith('.json')) continue;
      const code = file.replace(/\.json$/, '');
      const d: FBValue = JSON.parse(fs.readFileSync(path.join(full, file), 'utf-8'));

      let name = flat(get(d, 'Government', 'Country name', 'conventional short form'));
      if (!name || name.toLowerCase() === 'none') name = flat(get(d, 'Government', 'Country name', 'conventional long form'));
      if (!name || name.toLowerCase() === 'none') name = NAME_FIXES[code] ?? code;
      name = NAME_FIXES[code] ?? name;
      let official = flat(get(d, 'Government', 'Country name', 'conventional long form'));
      if (official && (official.toLowerCase() === 'none' || official === name)) official = null;

      const leaders: Record<string, unknown>[] = [];
      for (const [role, key] of [['Chief of state', 'chief of state'], ['Head of government', 'head of government']] as const) {
        const text = flat(get(d, 'Government', 'Executive branch', key));
        if (!text) continue;
        leaders.push({ role, text: text.split('\n')[0], name: leaderName(text) });
      }

      const area = flat(get(d, 'Geography', 'Area', 'total')) || flat(get(d, 'Geography', 'Area'));
      const iso2 = GEC_TO_ISO[code];
      const c: Record<string, unknown> = {
        id: code,
        name,
        official,
        region: REGION_NAMES[regionDir] ?? regionDir,
        flag: flagEmoji(iso2),
        mapId: GEC_TO_MAP[code] ?? (iso2 ? ISO2_TO_MAP[iso2] : undefined),
        capital: flat(get(d, 'Government', 'Capital', 'name')),
        population: flat(get(d, 'People and Society', 'Population', 'total')) || flat(get(d, 'People and Society', 'Population')),
        area,
        areaComp: flat(get(d, 'Geography', 'Area - comparative')),
        languages: flat(get(d, 'People and Society', 'Languages', 'Languages')) || flat(get(d, 'People and Society', 'Languages')),
        religions: flat(get(d, 'People and Society', 'Religions')),
        ethnic: flat(get(d, 'People and Society', 'Ethnic groups')),
        cities: flat(get(d, 'People and Society', 'Major urban areas - population')),
        leaders: leaders.length ? leaders : undefined,
        background: flat(get(d, 'Introduction', 'Background')),
        govType: flat(get(d, 'Government', 'Government type')),
        independence: flat(get(d, 'Government', 'Independence')),
        natHoliday: flat(get(d, 'Government', 'National holiday')),
        flagDesc: flat(get(d, 'Government', 'Flag')),
        symbols: flat(get(d, 'Government', 'National symbol(s)')),
        anthem: flat(get(d, 'Government', 'National anthem(s)')),
        geo: {
          'Location': flat(get(d, 'Geography', 'Location')),
          'Climate': flat(get(d, 'Geography', 'Climate')),
          'Terrain': flat(get(d, 'Geography', 'Terrain')),
          'Elevation': flat(get(d, 'Geography', 'Elevation')),
          'Coastline': flat(get(d, 'Geography', 'Coastline')),
          'Natural resources': flat(get(d, 'Geography', 'Natural resources')),
          'Natural hazards': flat(get(d, 'Geography', 'Natural hazards')),
          'Geography note': flat(get(d, 'Geography', 'Geography - note')),
        },
        people: {
          'Median age': flat(get(d, 'People and Society', 'Median age', 'total')) || flat(get(d, 'People and Society', 'Median age')),
          'Life expectancy': flat(get(d, 'People and Society', 'Life expectancy at birth', 'total population')),
          'Population growth': flat(get(d, 'People and Society', 'Population growth rate')),
          'Urbanization': flat(get(d, 'People and Society', 'Urbanization', 'urban population')),
          'Literacy': flat(get(d, 'People and Society', 'Literacy', 'total population')),
          'Nationality': flat(get(d, 'People and Society', 'Nationality', 'adjective')),
        },
        econ: {
          'Overview': flat(get(d, 'Economy', 'Economic overview')),
          'GDP (PPP)': flat(get(d, 'Economy', 'Real GDP (purchasing power parity)', 'Real GDP (purchasing power parity) 2024')) || flat(get(d, 'Economy', 'Real GDP (purchasing power parity)')),
          'GDP per capita': flat(get(d, 'Economy', 'Real GDP per capita', 'Real GDP per capita 2024')) || flat(get(d, 'Economy', 'Real GDP per capita')),
          'GDP growth': flat(get(d, 'Economy', 'Real GDP growth rate', 'Real GDP growth rate 2024')) || flat(get(d, 'Economy', 'Real GDP growth rate')),
          'Inflation': flat(get(d, 'Economy', 'Inflation rate (consumer prices)', 'Inflation rate (consumer prices) 2024')) || flat(get(d, 'Economy', 'Inflation rate (consumer prices)')),
          'Industries': flat(get(d, 'Economy', 'Industries')),
          'Agricultural products': flat(get(d, 'Economy', 'Agricultural products')),
          'Unemployment': flat(get(d, 'Economy', 'Unemployment rate', 'Unemployment rate 2024')) || flat(get(d, 'Economy', 'Unemployment rate')),
          'Exports - partners': flat(get(d, 'Economy', 'Exports - partners')),
          'Exports - commodities': flat(get(d, 'Economy', 'Exports - commodities')),
          'Imports - partners': flat(get(d, 'Economy', 'Imports - partners')),
          'Exchange rates': flat(get(d, 'Economy', 'Exchange rates', 'Currency')),
        },
        infra: {
          'Internet users': flat(get(d, 'Communications', 'Internet users', 'percent of population')) || flat(get(d, 'Communications', 'Internet users', 'total')),
          'Internet country code': flat(get(d, 'Communications', 'Internet country code')),
          'Electricity access': flat(get(d, 'Energy', 'Electricity access', 'electrification - total population')),
          'Airports': flat(get(d, 'Transportation', 'Airports')),
          'Railways': flat(get(d, 'Transportation', 'Railways', 'total')),
        },
        military: {
          'Forces': flat(get(d, 'Military and Security', 'Military and security forces')),
          'Expenditures': flat(get(d, 'Military and Security', 'Military expenditures', 'Military Expenditures 2024')) || flat(get(d, 'Military and Security', 'Military expenditures')),
        },
      };
      countries.push(prune(c) as Record<string, unknown>);
    }
  }
  countries.sort((a, b) => {
    const aw = ['World', 'Oceans'].includes(a.region as string) ? 1 : 0;
    const bw = ['World', 'Oceans'].includes(b.region as string) ? 1 : 0;
    return aw - bw || (a.name as string).localeCompare(b.name as string);
  });
  return countries;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'factbook-'));
  const dir = path.join(tmp, 'factbook.json');
  try {
    execFileSync('git', ['clone', '--depth', '1', '--quiet', REPO, dir], { stdio: 'pipe', timeout: 300_000 });
    const dataDate = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cs'], { encoding: 'utf-8' }).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) throw new Error(`bad data date: ${dataDate}`);

    const countries = buildDataset(dir);
    if (countries.length < 200) throw new Error(`only ${countries.length} countries extracted — refusing to overwrite`);

    const json = JSON.stringify(countries).replace(/<\//g, '<\\/');
    const mapJson = fs.readFileSync(path.join(process.cwd(), 'scripts', 'factbook-world-map.json'), 'utf-8').replace(/<\//g, '<\\/');
    const dateLabel = new Date(`${dataDate}T12:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
    const tpl = fs.readFileSync(TEMPLATE, 'utf-8');
    // date first so it can never touch the data blob; function replacement so `$`
    // sequences inside the JSON are inserted literally, not as replacement patterns
    const page = tpl.replace(/__DATA_DATE__/g, dateLabel).replace('__DATA__', () => json).replace('__MAPDATA__', () => mapJson);
    if (page.includes('__DATA__') || page.includes('__DATA_DATE__') || page.includes('__MAPDATA__')) throw new Error('template placeholders not fully replaced');

    const headEnd = page.indexOf('<div class="topbar">');
    if (headEnd < 0) throw new Error('template missing topbar marker');
    const full = `<!DOCTYPE html>\n<html lang="en">\n<head>\n${page.slice(0, headEnd)}</head>\n<body>\n${page.slice(headEnd)}\n</body>\n</html>\n`;
    if (full.length < 1_000_000 || full.length > 8_000_000) throw new Error(`suspicious output size ${full.length} — refusing to overwrite`);

    fs.writeFileSync(OUT, full);
    console.log(`Factbook artifact regenerated: ${countries.length} entries, data as of ${dataDate}, ${(full.length / 1e6).toFixed(2)} MB`);
  } catch (err) {
    if (fs.existsSync(OUT)) {
      console.warn(`WARNING: factbook artifact regeneration failed, keeping the committed copy: ${err}`);
    } else {
      throw err;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
