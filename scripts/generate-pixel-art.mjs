import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'public', 'art')
mkdirSync(OUT, { recursive: true })

const C = {
    ink: [8, 11, 26], deep: [16, 21, 43], blue: [29, 40, 80],
    steel: [51, 80, 122], teal: [54, 182, 162], mint: [139, 224, 194],
    amber: [242, 163, 58], gold: [255, 212, 119], red: [231, 91, 85],
    paper: [242, 239, 226], shadow: [48, 43, 64],
}

class Bitmap {
    constructor(w, h, bg = C.ink) {
        this.w = w
        this.h = h
        this.p = new Uint8Array(w * h * 3)
        this.fill(bg)
    }
    set(x, y, c) {
        x = Math.round(x); y = Math.round(y)
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
        const i = (y * this.w + x) * 3
        this.p[i] = c[0]; this.p[i + 1] = c[1]; this.p[i + 2] = c[2]
    }
    fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c) }
    rect(x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c) }
    line(x0, y0, x1, y1, c, thick = 1) {
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
        let err = dx + dy
        while (true) {
            this.rect(x0 - Math.floor(thick / 2), y0 - Math.floor(thick / 2), thick, thick, c)
            if (x0 === x1 && y0 === y1) break
            const e2 = 2 * err
            if (e2 >= dy) { err += dy; x0 += sx }
            if (e2 <= dx) { err += dx; y0 += sy }
        }
    }
    circle(cx, cy, r, c, inner = null) {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            const d = x * x + y * y
            if (d <= r * r && (!inner || d >= inner * inner)) this.set(cx + x, cy + y, c)
        }
    }
    poly(points, c) {
        const ys = points.map((p) => p[1])
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
            const cuts = []
            for (let i = 0; i < points.length; i++) {
                const a = points[i], b = points[(i + 1) % points.length]
                if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
                    cuts.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
                }
            }
            cuts.sort((a, b) => a - b)
            for (let i = 0; i + 1 < cuts.length; i += 2) this.rect(Math.ceil(cuts[i]), y, Math.floor(cuts[i + 1] - cuts[i]) + 1, 1, c)
        }
    }
}

function savePng(name, bmp) {
    const ppm = join(OUT, `${name}.ppm`)
    const png = join(OUT, `${name}.png`)
    const head = Buffer.from(`P6\n${bmp.w} ${bmp.h}\n255\n`)
    writeFileSync(ppm, Buffer.concat([head, Buffer.from(bmp.p)]))
    execFileSync('sips', ['-s', 'format', 'png', ppm, '--out', png], { stdio: 'ignore' })
    unlinkSync(ppm)
}

function starfield(b, y0 = 0, y1 = b.h) {
    for (let y = y0; y < y1; y++) for (let x = 0; x < b.w; x++) {
        const n = (x * 37 + y * 19 + x * y * 3) % 211
        if (n === 0) b.set(x, y, C.steel)
        if (n === 1 && ((x + y) & 3) === 0) b.set(x, y, C.paper)
    }
}

function table() {
    const b = new Bitmap(256, 448, C.ink)
    starfield(b)
    b.circle(128, 95, 67, C.deep)
    b.circle(128, 95, 64, C.blue)
    for (let y = 34; y < 154; y += 4) for (let x = 70; x < 188; x += 4) {
        if ((x + y) % 12 === 0 && (x - 128) ** 2 + (y - 95) ** 2 < 58 ** 2) b.rect(x, y, 2, 2, C.steel)
    }
    b.circle(104, 80, 11, C.deep); b.circle(151, 115, 16, C.deep); b.circle(146, 59, 7, C.deep)

    b.poly([[20, 42], [236, 42], [247, 417], [203, 444], [53, 444], [9, 417]], C.shadow)
    b.poly([[25, 48], [231, 48], [240, 412], [198, 437], [58, 437], [16, 412]], C.deep)
    b.line(25, 48, 16, 412, C.steel, 5); b.line(231, 48, 240, 412, C.steel, 5)
    b.line(31, 52, 23, 409, C.mint, 1); b.line(225, 52, 233, 409, C.mint, 1)

    // Three mail lanes and gates.
    for (const x of [58, 128, 198]) {
        b.rect(x - 11, 57, 22, 34, C.blue)
        b.line(x - 11, 57, x - 11, 92, C.steel, 2)
        b.line(x + 11, 57, x + 11, 92, C.steel, 2)
        b.rect(x - 5, 63, 10, 7, C.paper)
        b.line(x - 5, 63, x, 67, C.amber); b.line(x + 4, 63, x, 67, C.amber)
    }

    // Conveyor ramps.
    b.poly([[31, 257], [47, 265], [83, 183], [69, 175]], C.steel)
    b.poly([[36, 254], [44, 258], [78, 181], [72, 179]], C.teal)
    b.line(39, 249, 74, 178, C.mint, 1)
    b.poly([[225, 257], [209, 265], [173, 183], [187, 175]], C.steel)
    b.poly([[220, 254], [212, 258], [178, 181], [184, 179]], C.amber)
    b.line(217, 249, 182, 178, C.gold, 1)
    for (let y = 202; y < 252; y += 12) {
        b.line(48, y, 57, y + 3, C.deep, 2); b.line(208, y + 3, 217, y, C.deep, 2)
    }

    // Sorting bumpers.
    for (const [x, y, c] of [[92, 139, C.teal], [128, 154, C.amber], [164, 139, C.red]]) {
        b.circle(x, y, 15, C.steel); b.circle(x, y, 12, C.deep); b.circle(x, y, 8, c)
        b.rect(x - 4, y - 5, 8, 7, C.paper); b.line(x - 4, y - 5, x, y - 1, C.shadow)
    }

    // Center scoop / sunrise seal.
    b.circle(128, 209, 19, C.steel)
    b.circle(128, 209, 15, C.ink)
    b.circle(128, 211, 8, C.amber)
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4
        b.line(128 + Math.round(Math.cos(a) * 10), 211 + Math.round(Math.sin(a) * 10),
            128 + Math.round(Math.cos(a) * 14), 211 + Math.round(Math.sin(a) * 14), C.gold, 2)
    }

    // Envelope target bank.
    for (const x of [101, 128, 155]) {
        b.rect(x - 9, 250, 18, 13, C.paper)
        b.line(x - 9, 250, x, 257, C.amber); b.line(x + 8, 250, x, 257, C.amber)
        b.rect(x - 9, 263, 18, 3, C.steel)
    }

    // Lock cabinet.
    b.rect(28, 101, 31, 46, C.steel); b.rect(32, 105, 23, 38, C.blue)
    b.rect(36, 111, 15, 10, C.paper); b.line(36, 111, 43, 117, C.red); b.line(50, 111, 43, 117, C.red)
    b.rect(36, 129, 15, 8, C.ink); b.rect(39, 131, 9, 2, C.teal)

    // Shooter lane, rails, outlanes and apron.
    b.rect(224, 78, 12, 328, C.blue); b.line(224, 78, 224, 406, C.steel, 2)
    b.line(231, 82, 231, 402, C.mint, 1)
    b.poly([[18, 328], [58, 360], [56, 409], [27, 381]], C.blue)
    b.poly([[238, 328], [198, 360], [200, 409], [229, 381]], C.blue)
    b.line(24, 334, 56, 363, C.red, 2); b.line(232, 334, 200, 363, C.red, 2)
    b.poly([[57, 385], [86, 415], [170, 415], [199, 385], [199, 435], [57, 435]], C.shadow)
    b.rect(91, 424, 74, 7, C.ink)
    for (let x = 64; x < 195; x += 11) b.rect(x, 421 + ((x / 11) % 2) * 3, 5, 2, C.amber)

    // Pixel bolts and orbit arrows.
    for (const [x, y] of [[30, 65], [226, 65], [27, 310], [229, 310], [71, 303], [185, 303]]) {
        b.circle(x, y, 3, C.steel); b.set(x - 1, y - 1, C.paper)
    }
    b.line(77, 307, 91, 297, C.teal, 2); b.line(179, 307, 165, 297, C.amber, 2)
    return b
}

function title() {
    const b = new Bitmap(256, 448, C.ink)
    starfield(b)
    b.circle(176, 108, 66, C.steel); b.circle(176, 108, 63, C.blue)
    b.circle(153, 91, 12, C.deep); b.circle(195, 128, 18, C.deep); b.circle(198, 73, 8, C.deep)
    // Depot silhouette.
    b.rect(14, 270, 228, 139, C.deep)
    b.poly([[14, 270], [56, 224], [117, 254], [158, 200], [242, 270]], C.shadow)
    b.rect(42, 282, 48, 66, C.blue); b.rect(166, 264, 49, 84, C.blue)
    for (const x of [49, 65, 74, 173, 188, 201]) {
        b.rect(x, 291 + (x % 3) * 8, 8, 11, C.amber); b.rect(x + 2, 293 + (x % 3) * 8, 4, 7, C.gold)
    }
    // Mail rocket / conveyor.
    b.poly([[103, 246], [128, 214], [153, 246], [145, 337], [111, 337]], C.steel)
    b.poly([[114, 249], [128, 229], [142, 249], [138, 326], [118, 326]], C.teal)
    b.rect(121, 270, 14, 10, C.paper); b.line(121, 270, 128, 276, C.red); b.line(134, 270, 128, 276, C.red)
    b.poly([[117, 334], [139, 334], [151, 384], [128, 411], [105, 384]], C.amber)
    b.poly([[121, 336], [135, 336], [141, 379], [128, 394], [115, 379]], C.gold)
    for (let y = 414; y < 448; y += 4) for (let x = 0; x < 256; x += 4) {
        if (((x / 4 + y / 4) & 1) === 0) b.rect(x, y, 4, 4, C.blue)
    }
    return b
}

function ball() {
    const b = new Bitmap(10, 10, C.deep)
    b.fill(C.deep)
    b.circle(5, 5, 5, C.teal)
    b.circle(5, 5, 4, C.gold)
    b.circle(5, 5, 3, C.paper)
    b.set(3, 3, C.mint); b.set(4, 3, C.paper)
    b.set(8, 6, C.steel); b.set(7, 8, C.steel); b.set(2, 7, C.amber)
    return b
}

function flipper(left) {
    const b = new Bitmap(40, 12, C.deep)
    b.circle(left ? 6 : 33, 6, 5, C.steel)
    b.circle(left ? 6 : 33, 6, 3, C.paper)
    if (left) {
        b.poly([[6, 2], [35, 4], [39, 6], [35, 8], [6, 10]], C.red)
        b.line(8, 4, 34, 5, C.gold, 2)
    } else {
        b.poly([[34, 2], [5, 4], [1, 6], [5, 8], [34, 10]], C.red)
        b.line(32, 4, 6, 5, C.gold, 2)
    }
    return b
}

function spark() {
    const b = new Bitmap(12, 12, C.deep)
    b.line(6, 0, 6, 11, C.gold, 2); b.line(0, 6, 11, 6, C.gold, 2)
    b.line(2, 2, 9, 9, C.amber); b.line(9, 2, 2, 9, C.amber)
    b.circle(6, 6, 2, C.paper)
    return b
}

savePng('moonmail-table', table())
savePng('moonmail-title', title())
savePng('mail-ball', ball())
savePng('flipper-left', flipper(true))
savePng('flipper-right', flipper(false))
savePng('mail-spark', spark())
console.log('Generated Moonmail raster art in public/art')
