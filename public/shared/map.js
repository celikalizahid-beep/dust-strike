// Paylaşılan harita tanımları (sunucu + istemci aynı veriyi kullanır).
// Her harita 2 metrelik hücrelerden oluşan bir ızgara: önce her yer duvar, sonra koridorlar oyulur.
// '#' duvar, '.' zemin, 'C' büyük sandık (2.1 m), 'c' küçük sandık (1.1 m, üstüne zıplanabilir).
// Izgaranın üstüne ek kutular konabilir: merdiven ve yükseltilmiş zemin (üstünde yürünür), tünel tavanı,
// kapı kanadı, alçak duvar, pencere pervazı; ayrıca araba, konteyner, varil gibi eşyalar.

export const CELL = 2;

function grid(w, h) {
  const g = Array.from({ length: h }, () => new Array(w).fill('#'));
  const carve = (c1, r1, c2, r2) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = '.'; };
  const put = (ch, list) => { for (const [c, r] of list) g[r][c] = ch; };
  const line = (ch, c1, r1, c2, r2) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = ch; };
  const blocks = [], props = [];
  // Hücre aralığı kutusu (c2/r2 dahil). mat: floor, step (üstünde yürünür), wall, roof, door
  const block = (c1, r1, c2, r2, y0, y1, mat = 'wall') => blocks.push({ x0: c1, z0: r1, x1: c2 + 1, z1: r2 + 1, y0, y1, mat });
  // Kesin sınırlı kutu (hücre biriminde, kesirli): kapı kanadı gibi ince parçalar
  const slab = (x0, z0, x1, z1, y0, y1, mat = 'wall') => blocks.push({ x0, z0, x1, z1, y0, y1, mat });
  const platform = (c1, r1, c2, r2, y) => block(c1, r1, c2, r2, 0, y, 'floor');
  // Merdiven: bölge 'dir' yönüne (N, S, E, W) doğru y0'dan y1'e yükselir; basamaklar en çok 0,4 m (kendiliğinden çıkılır)
  const stairs = (c1, r1, c2, r2, dir, y0, y1) => {
    const x0 = c1, x1 = c2 + 1, z0 = r1, z1 = r2 + 1;
    const n = Math.max(1, Math.ceil((y1 - y0) / 0.4 - 1e-6));
    for (let i = 0; i < n; i++) {
      const top = y0 + ((y1 - y0) * (i + 1)) / n, a = i / n, b = (i + 1) / n;
      const s = { y0: 0, y1: top, mat: 'step', x0, x1, z0, z1 };
      if (dir === 'E') { s.x0 = x0 + (x1 - x0) * a; s.x1 = x0 + (x1 - x0) * b; }
      else if (dir === 'W') { s.x0 = x1 - (x1 - x0) * b; s.x1 = x1 - (x1 - x0) * a; }
      else if (dir === 'S') { s.z0 = z0 + (z1 - z0) * a; s.z1 = z0 + (z1 - z0) * b; }
      else { s.z0 = z1 - (z1 - z0) * b; s.z1 = z1 - (z1 - z0) * a; }
      blocks.push(s);
    }
  };
  // Tünel / iç mekân tavanı: altından geçilir, gölge düşürür
  const roof = (c1, r1, c2, r2, y = 3.3) => block(c1, r1, c2, r2, y, y + 0.5, 'roof');
  // Pencere: oyulmuş hücreye denizlik ve üst lento konur; içinden görülür ve ateş edilir, geçilemez
  const win = (c, r, sill = 1.25, top = 2.7) => { block(c, r, c, r, 0, sill, 'wall'); block(c, r, c, r, top, 6.5, 'wall'); };
  // Eşya: car, van, container, barrel, sacks, palm, booth, bench (c, r: merkez hücre koordinatı, rot: 0 ya da 90)
  const prop = (kind, c, r, rot = 0) => props.push({ kind, c, r, rot });
  return { g, carve, put, line, block, slab, platform, stairs, roof, win, prop, blocks, props };
}

// ---------------------------------------------------------------- de_kum: CS2 Dust II düzeni
// Kuzeyde CT doğuşu, güneyde T doğuşu. Doğuda Uzun A, ortada Orta ve Kedi yolu (Kısa A), batıda B tünelleri.
function kum() {
  const G = grid(56, 56);
  const { g, carve, put, block, slab, platform, stairs, roof, win, prop } = G;
  const A = 1.2; // A bölgesi, Kısa A ve kedi yolu yüksekliği
  // ---- CT doğuşu ve CT orta
  carve(25, 3, 38, 10);          // CT doğuşu
  carve(26, 11, 28, 17);         // CT orta
  // ---- A bölgesi (yükseltilmiş) ve CT rampası
  carve(40, 3, 52, 15);          // A bölgesi
  carve(39, 5, 39, 9);           // CT doğuşu -> A
  stairs(39, 5, 40, 9, 'E', 0, A); // CT rampası
  platform(41, 3, 52, 15, A);
  platform(40, 3, 40, 4, A);
  platform(40, 10, 40, 15, A);
  slab(50.4, 3, 50.7, 5.3, A, A + 1.05, 'wall'); // Goose: köşedeki alçak duvar
  prop('car', 45, 12.5, 0);       // A arabası
  put('C', [[47, 8], [43, 5]]); put('c', [[48, 8], [44, 5], [51, 13]]);
  // ---- Uzun A, A rampası ve Pit
  carve(47, 16, 51, 34);         // Uzun A
  stairs(47, 16, 51, 18, 'N', 0, A); // A rampası
  carve(52, 28, 54, 34);         // Pit
  slab(52, 28, 52.3, 33, 0, 0.9, 'wall'); // pit kenarı
  prop('container', 49, 23, 90);  // mavi konteyner
  put('c', [[51, 30]]);
  // ---- Long kapıları ve dış uzun
  carve(42, 33, 46, 34);         // Long kapıları
  carve(40, 33, 43, 45);         // dış uzun (T doğuşundan kuzeye)
  slab(44.9, 33, 45.1, 33.95, 0, 2.9, 'door');   // kapalı kanat
  slab(45.1, 34.88, 46, 35, 0, 2.9, 'door');     // açık kanat (duvara yaslı)
  block(42, 33, 46, 34, 2.9, 6.5, 'wall');       // kapı üstü
  put('C', [[41, 44]]); put('c', [[40, 37]]);
  // ---- T doğuşu
  carve(21, 44, 41, 53);
  prop('barrel', 23, 46.5); prop('barrel', 23.6, 47.2); prop('barrel', 39.5, 52.2);
  prop('sacks', 30, 52.6); prop('palm', 35.5, 50.5); prop('palm', 25, 51.5);
  put('C', [[33, 46]]); put('c', [[34, 46]]);
  // ---- Üst orta, Suicide, Orta, Xbox, orta kapılar
  carve(26, 36, 28, 43);         // Suicide
  carve(24, 32, 30, 35);         // üst orta
  carve(25, 18, 29, 31);         // orta
  slab(26, 17.85, 27.3, 18, 0, 2.9, 'door');     // orta kapılar: kapalı kanat
  slab(28.05, 16.9, 28.2, 17.95, 0, 2.9, 'door'); // açık kanat
  put('C', [[29, 25]]);           // Xbox
  put('c', [[24, 33], [30, 34]]);
  // ---- Kedi yolu ve Kısa A (Xbox yanından merdivenle çıkılır)
  carve(30, 21, 31, 24);         // kedi merdiveni
  stairs(30, 21, 31, 24, 'E', 0, A);
  carve(32, 18, 36, 24);         // kedi yolu
  platform(32, 18, 36, 24, A);
  carve(37, 15, 42, 20);         // Kısa A
  platform(37, 16, 42, 20, A);
  platform(37, 15, 39, 15, A);
  // ---- B kapıları ve pencere
  carve(18, 12, 25, 14);         // B kapıları koridoru (CT ortadan batıya)
  slab(18.4, 12, 18.6, 13.25, 0, 2.9, 'door');   // kapalı kanat
  slab(18.6, 14.85, 19.6, 15, 0, 2.9, 'door');   // açık kanat
  block(18, 12, 18, 14, 2.9, 6.5, 'wall');
  carve(19, 5, 24, 7);           // CT doğuşundan pencereye
  carve(18, 6, 18, 6); win(18, 6);
  // ---- B bölgesi
  carve(4, 3, 17, 17);
  platform(4, 3, 11, 4, 0.4);     // arka platform
  prop('car', 14.5, 9.5, 90);     // B arabası
  put('C', [[8, 10], [9, 10], [5, 15], [16, 4]]); put('c', [[8, 11], [10, 10], [15, 16], [6, 3]]);
  // ---- Üst B tünelleri, alt tüneller, tünel dışı
  carve(7, 18, 10, 30);          // üst tüneller
  roof(7, 19, 10, 29);
  carve(11, 26, 24, 28);         // alt tüneller (ortaya bağlanır)
  roof(11, 26, 23, 28);
  carve(8, 31, 12, 44);          // tünel dışı
  carve(13, 42, 20, 45);
  prop('barrel', 9, 34.5); prop('sacks', 12, 40.5);
  put('c', [[9, 22], [10, 29]]);
  return {
    w: 56, h: 56, g, blocks: G.blocks, props: G.props,
    sites: { A: [41, 4, 51, 14], B: [5, 5, 16, 16] },
    spawnT: [23, 46, 39, 52], spawnCT: [26, 4, 37, 9],
    buyT: [21, 44, 41, 53], buyCT: [25, 3, 38, 10],
    yawT: 0, yawCT: Math.PI,
  };
}

// ---------------------------------------------------------------- de_serap: CS2 Mirage düzeni
// Doğuda T doğuşu, batıda CT doğuşu. Güneyde A (saray, A rampası, orman), kuzeyde B (daireler, kısa, market).
function serap() {
  const G = grid(56, 48);
  const { g, carve, put, slab, platform, stairs, roof, win, prop } = G;
  // ---- T doğuşu
  carve(46, 18, 54, 30);
  prop('palm', 52.5, 28.5); prop('barrel', 47, 19); prop('barrel', 47.7, 19.4);
  // ---- Üst orta ve orta
  carve(40, 20, 45, 26);         // üst orta
  carve(22, 21, 39, 25);         // orta
  put('C', [[42, 22], [38, 25]]); put('c', [[43, 22]]);
  // ---- Pencere odası (CT tarafı, ortaya yukarıdan bakar)
  carve(16, 21, 20, 25);
  platform(16, 21, 20, 25, 2.0);
  carve(21, 22, 21, 24); for (const r of [22, 23, 24]) win(21, r, 2.6, 4.5);
  roof(16, 21, 20, 25, 4.6);
  carve(14, 22, 15, 24);         // CT -> pencere merdiveni
  stairs(14, 22, 15, 24, 'E', 0, 2.0);
  // ---- Kısa (orta -> B)
  carve(22, 11, 24, 20);
  carve(20, 11, 21, 13);
  // ---- Bağlantı ve orman (A'ya)
  carve(25, 26, 27, 29);
  stairs(25, 26, 27, 29, 'S', 0, 1.2);
  carve(16, 30, 27, 33);         // orman
  platform(16, 30, 27, 33, 1.2);
  carve(14, 30, 15, 33);         // CT -> orman merdiveni
  stairs(14, 30, 15, 33, 'E', 0, 1.2);
  // ---- A bölgesi
  carve(15, 34, 33, 44);
  stairs(22, 34, 25, 35, 'N', 0, 1.2); // A merdiveni (ormana)
  carve(12, 35, 14, 41);         // CT -> A
  prop('booth', 17.5, 37, 0);     // gişe
  put('C', [[24, 39], [29, 41], [30, 41], [26, 43]]); // ateş kutusu, üçlü
  put('c', [[29, 42], [20, 42], [31, 36]]);
  // ---- T rampası, A rampası, Tetris
  carve(42, 30, 47, 33);         // T rampası
  carve(34, 30, 41, 33);         // A rampası
  carve(34, 34, 35, 37);
  put('C', [[36, 31]]); put('c', [[37, 31], [36, 32]]); // Tetris
  // ---- Saray (yükseltilmiş, balkondan A'ya atlanır)
  carve(43, 34, 47, 36);         // saray girişi
  stairs(43, 34, 47, 36, 'S', 0, 1.6);
  carve(38, 37, 47, 42);         // saray içi
  platform(38, 37, 47, 42, 1.6);
  roof(38, 37, 47, 42, 4.8);
  carve(34, 38, 37, 41);         // saray balkonu
  platform(34, 38, 37, 41, 1.6);
  slab(34, 38, 34.25, 42, 1.6, 2.5, 'wall'); // balkon korkuluğu (üstünden atlanır)
  // ---- B daireleri (T doğuşundan kuzeybatıya)
  carve(44, 9, 49, 17);          // T daireleri
  carve(20, 6, 45, 8);           // B daireleri koridoru
  roof(21, 6, 43, 8);
  put('c', [[30, 7], [38, 6]]);
  // ---- B bölgesi, market, mutfak
  carve(4, 3, 19, 14);
  prop('van', 14, 6, 0);          // minibüs
  prop('bench', 9, 12.6, 0);      // bank
  put('C', [[7, 5], [8, 5], [5, 11]]); put('c', [[7, 6], [17, 12], [11, 4]]);
  carve(5, 15, 8, 21);           // market
  roof(5, 16, 8, 20);
  carve(9, 17, 12, 20);          // mutfak
  roof(9, 17, 12, 20);
  // ---- CT doğuşu
  carve(3, 22, 13, 34);
  prop('palm', 4.5, 33); prop('palm', 11.5, 23);
  put('C', [[6, 28]]); put('c', [[7, 28]]);
  return {
    w: 56, h: 48, g, blocks: G.blocks, props: G.props,
    sites: { A: [16, 35, 32, 43], B: [5, 4, 18, 13] },
    spawnT: [47, 19, 53, 29], spawnCT: [4, 23, 12, 33],
    buyT: [46, 18, 54, 30], buyCT: [3, 22, 13, 34],
    yawT: Math.PI / 2, yawCT: -Math.PI / 2,
  };
}

// ---------------------------------------------------------------- de_depo: endüstriyel depo, raflı ana salon
function depo() {
  const { g, carve, put } = grid(40, 32);
  carve(1, 12, 6, 19);   // T doğuş (batı)
  carve(33, 12, 38, 19); // CT doğuş (doğu)
  carve(12, 8, 27, 23);  // ana salon
  carve(1, 2, 38, 5);    // kuzey koridoru
  carve(1, 26, 38, 29);  // güney koridoru
  carve(28, 1, 37, 7);   // A: yükleme rampası
  carve(28, 24, 37, 30); // B: konteyner sahası
  carve(7, 14, 11, 17);  // T -> salon
  carve(2, 6, 5, 11);    // T -> kuzey
  carve(2, 20, 5, 25);   // T -> güney
  carve(18, 6, 21, 7);   // salon -> kuzey
  carve(18, 24, 21, 25); // salon -> güney
  carve(34, 8, 37, 11);  // CT -> A
  carve(34, 20, 37, 23); // CT -> B
  carve(28, 14, 32, 17); // salon -> CT
  // Salondaki raf sıraları (ortada ve kenarlarda geçit bırakılır)
  for (const r of [11, 14, 17, 20]) for (const c of [14, 15, 16, 17, 22, 23, 24, 25]) put('C', [[c, r]]);
  put('C', [[9, 2], [9, 3], [30, 3], [31, 3], [35, 6], [30, 27], [31, 27], [35, 25], [9, 28], [9, 29], [5, 18], [34, 18]]);
  put('c', [[24, 5], [32, 3], [29, 6], [32, 27], [29, 25], [24, 26], [3, 14], [36, 14], [10, 15], [29, 16], [19, 9], [20, 22]]);
  return {
    w: 40, h: 32, g,
    sites: { A: [29, 1, 37, 7], B: [29, 24, 37, 30] },
    spawnT: [2, 13, 6, 19], spawnCT: [33, 13, 37, 19],
    buyT: [1, 12, 6, 19], buyCT: [33, 12, 38, 19],
    yawT: -Math.PI / 2, yawCT: Math.PI / 2,
  };
}

// ---------------------------------------------------------------- de_kar: karlı kış üssü, geniş orta avlu
function kar() {
  const { g, carve, put } = grid(44, 36);
  carve(17, 1, 26, 6);   // CT doğuş (kuzey)
  carve(17, 29, 26, 34); // T doğuş (güney)
  carve(31, 3, 42, 12);  // A bölgesi
  carve(1, 3, 12, 12);   // B bölgesi
  carve(15, 12, 28, 23); // orta avlu
  carve(4, 13, 7, 28);   // batı yolu (B)
  carve(36, 13, 39, 28); // doğu yolu (A)
  carve(4, 25, 39, 28);  // güney caddesi
  carve(18, 24, 25, 24); // avlu -> cadde
  carve(20, 7, 23, 11);  // avlu -> CT
  carve(27, 3, 30, 5);   // CT -> A
  carve(13, 3, 16, 5);   // CT -> B
  carve(29, 15, 35, 17); // avlu -> doğu yolu
  carve(8, 18, 14, 20);  // batı yolu -> avlu
  put('C', [[18, 15], [19, 15], [25, 19], [25, 20], [16, 21], [33, 6], [34, 6], [40, 10], [3, 6], [4, 6], [10, 10],
    [12, 26], [30, 27], [22, 17]]);
  put('c', [[20, 15], [22, 18], [24, 20], [35, 6], [39, 10], [5, 6], [9, 10], [13, 26], [31, 27], [5, 17], [38, 21], [19, 3], [24, 31], [21, 13]]);
  return {
    w: 44, h: 36, g,
    sites: { A: [32, 4, 41, 11], B: [2, 4, 11, 11] },
    spawnT: [18, 30, 26, 34], spawnCT: [18, 1, 26, 5],
    buyT: [17, 29, 26, 34], buyCT: [17, 1, 26, 6],
    yawT: 0, yawCT: Math.PI,
  };
}

// ---------------------------------------------------------------- dm_arena: küçük simetrik arena (sadece ölüm maçı)
function arena() {
  const { g, carve, put, line } = grid(28, 28);
  carve(1, 1, 26, 26);
  for (const [c, r] of [[6, 6], [19, 6], [6, 19], [19, 19]]) line('#', c, r, c + 2, r + 2);
  line('#', 13, 13, 14, 14);
  for (const r of [4, 23]) { line('#', 10, r, 12, r); line('#', 15, r, 17, r); }
  for (const c of [4, 23]) { line('#', c, 10, c, 12); line('#', c, 15, c, 17); }
  put('C', [[2, 2], [25, 25], [2, 25], [25, 2], [13, 9], [14, 18], [9, 14], [18, 13]]);
  put('c', [[3, 13], [24, 14], [13, 3], [14, 24], [9, 9], [18, 18], [9, 18], [18, 9], [12, 9], [15, 18], [9, 15], [18, 12]]);
  return {
    w: 28, h: 28, g,
    sites: null,
    spawnT: [2, 22, 4, 26], spawnCT: [23, 1, 25, 5],
    buyT: [1, 21, 5, 26], buyCT: [22, 1, 26, 6],
    yawT: -Math.PI / 4, yawCT: Math.PI / 4 * 3,
    wallH: () => 3.6,
  };
}

export const MAPS = {
  kum: { title: 'de_kum', desc: 'Dust II düzeni · Uzun A, orta, B tünelleri', theme: 'desert', modes: ['classic', 'tdm', 'ffa'], def: kum },
  serap: { title: 'de_serap', desc: 'Mirage düzeni · saray, pencere, B daireleri', theme: 'mirage', modes: ['classic', 'tdm', 'ffa'], def: serap },
  depo: { title: 'de_depo', desc: 'Endüstriyel depo · raflar', theme: 'industrial', modes: ['classic', 'tdm', 'ffa'], def: depo },
  kar: { title: 'de_kar', desc: 'Kış üssü · geniş avlu', theme: 'snow', modes: ['classic', 'tdm', 'ffa'], def: kar },
  arena: { title: 'dm_arena', desc: 'Küçük arena · hızlı çatışma', theme: 'arena', modes: ['tdm', 'ffa'], def: arena },
};
export const MAP_IDS = Object.keys(MAPS);

const cache = new Map();
// Eşya ölçüleri (m): uzunluk (rot 0'da x yönü), genişlik, yükseklik
const PROP_SIZE = {
  car: [4.4, 1.9, 1.45], van: [5.2, 2.1, 2.25], container: [6.1, 2.45, 2.6], barrel: [0.62, 0.62, 0.92],
  sacks: [1.3, 1.0, 0.55], palm: [0.5, 0.5, 4.2], booth: [2.2, 2.2, 2.7], bench: [1.9, 0.6, 0.5],
};

export function buildMap(id = 'kum') {
  if (!MAPS[id]) id = 'kum';
  if (cache.has(id)) return cache.get(id);
  const info = MAPS[id];
  const def = info.def();
  const { w, h, g } = def;
  const ox = -w * CELL / 2, oz = -h * CELL / 2;
  const cx = (c) => ox + (c + 0.5) * CELL;
  const cz = (r) => oz + (r + 0.5) * CELL;
  const rect = ([c1, r1, c2, r2]) => ({ x0: ox + c1 * CELL, z0: oz + r1 * CELL, x1: ox + (c2 + 1) * CELL, z1: oz + (r2 + 1) * CELL });
  const boxes = [];
  const used = g.map((row) => row.map(() => false));

  // Duvar hücrelerini büyük dikdörtgenlere birleştir (daha az kutu = daha hızlı çarpışma ve çizim)
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (g[r][c] !== '#' || used[r][c]) continue;
      let ww = 1;
      while (c + ww < w && g[r][c + ww] === '#' && !used[r][c + ww]) ww++;
      let hh = 1;
      outer: while (r + hh < h) {
        for (let k = 0; k < ww; k++) if (g[r + hh][c + k] !== '#' || used[r + hh][c + k]) break outer;
        hh++;
      }
      for (let rr = r; rr < r + hh; rr++) for (let cc = c; cc < c + ww; cc++) used[rr][cc] = true;
      const border = c === 0 || r === 0 || c + ww === w || r + hh === h;
      const height = border ? 9 : def.wallH ? def.wallH(c, r) : 6.5 + ((c * 7 + r * 3) % 3) * 1.25;
      boxes.push({ min: [ox + c * CELL, 0, oz + r * CELL], max: [ox + (c + ww) * CELL, height, oz + (r + hh) * CELL], type: 'wall', v: (c + r) % 2, border });
    }
  }
  // Ek kutular (merdiven, platform, tavan, kapı, alçak duvar): hücre biriminden metreye
  const blocks = (def.blocks || []).map((b) => ({ min: [ox + b.x0 * CELL, b.y0, oz + b.z0 * CELL], max: [ox + b.x1 * CELL, b.y1, oz + b.z1 * CELL], type: 'block', mat: b.mat }));
  boxes.push(...blocks);
  // Bir noktadaki yürünen zemin yüksekliği (platform ve merdiven üstü)
  const floorTop = (x, z) => {
    let y = 0;
    for (const b of blocks) if ((b.mat === 'floor' || b.mat === 'step') && x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]) y = Math.max(y, b.max[1]);
    return y;
  };
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = g[r][c];
      if (ch !== 'c' && ch !== 'C') continue;
      const inset = ch === 'c' ? 0.15 : 0.05;
      const ht = ch === 'c' ? 1.1 : 2.1;
      const y = floorTop(cx(c), cz(r));
      boxes.push({ min: [ox + c * CELL + inset, y, oz + r * CELL + inset], max: [ox + (c + 1) * CELL - inset, y + ht, oz + (r + 1) * CELL - inset], type: 'crate', big: ch === 'C' });
    }
  }
  // Eşyalar: çarpışma kutusu + çizim bilgisi (konum, yön, ölçü)
  const props = (def.props || []).map((p) => {
    const [len, wid, ht] = PROP_SIZE[p.kind];
    const x = ox + p.c * CELL, z = oz + p.r * CELL, y = floorTop(x, z);
    const sx = p.rot === 90 ? wid : len, sz = p.rot === 90 ? len : wid;
    boxes.push({ min: [x - sx / 2, y, z - sz / 2], max: [x + sx / 2, y + ht, z + sz / 2], type: 'prop', kind: p.kind });
    return { kind: p.kind, x, y, z, rot: p.rot, len, wid, ht };
  });
  // Doğma noktası: hücre ortasında duvar, sandık, kapı ya da eşya yoksa; platform üstündeyse onun yüksekliğinde
  const spot = (c, r) => {
    if (g[r][c] !== '.') return null;
    const x = cx(c), z = cz(r);
    let y = 0;
    for (const b of boxes) {
      if (x + 0.45 <= b.min[0] || x - 0.45 >= b.max[0] || z + 0.45 <= b.min[2] || z - 0.45 >= b.max[2]) continue;
      if (b.type === 'block' && (b.mat === 'floor' || b.mat === 'step')) { y = Math.max(y, b.max[1]); continue; }
      if (b.min[1] < y + 2.2) return null;
    }
    return [x, y, z];
  };
  const spawnList = ([c1, r1, c2, r2]) => {
    const out = [];
    for (let r = r1; r <= r2; r += 2) for (let c = c1; c <= c2; c += 2) { const s = spot(c, r); if (s) out.push(s); }
    return out;
  };
  const dmSpawns = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const s = spot(c, r); if (s) dmSpawns.push(s); }
  const zone = (cells) => { const R = rect(cells); return { x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2, r: Math.hypot(R.x1 - R.x0, R.z1 - R.z0) / 2 }; };
  const sites = {};
  if (def.sites) for (const k of Object.keys(def.sites)) sites[k] = rect(def.sites[k]);

  const map = {
    id, title: info.title, desc: info.desc, theme: info.theme, modes: info.modes,
    w, h, ox, oz, grid: g, boxes, props, dmSpawns,
    spawns: { T: spawnList(def.spawnT), CT: spawnList(def.spawnCT) },
    yaw: { T: def.yawT, CT: def.yawCT },
    sites,
    buyZones: { T: zone(def.buyT), CT: zone(def.buyCT) },
    bounds: { x0: ox, z0: oz, x1: ox + w * CELL, z1: oz + h * CELL },
    siteAt(x, z) {
      for (const k of Object.keys(sites)) {
        const s = sites[k];
        if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return k;
      }
      return null;
    },
    inBuyZone(team, x, z) {
      const b = map.buyZones[team];
      return !!b && Math.hypot(x - b.x, z - b.z) <= b.r;
    },
  };
  cache.set(id, map);
  return map;
}
