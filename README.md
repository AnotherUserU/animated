# Clove Story: animasi 8-bit untuk Nusajawa Clove

Film pendek 8-bit (sekitar 72 detik, looping) tentang perjalanan cengkeh Nusajawa, dari bibit sampai ke tangan pembeli di luar negeri. Ditulis dengan JavaScript + Canvas biasa. Tanpa library, tanpa file gambar, cuma satu file: `clove-story.js`.

| # | Adegan | Isi |
|---|--------|-----|
| – | Intro | Gunung berapi & sawah terasering Jawa Timur, judul "Nusajawa Clove" |
| 1 | Menanam | Petani bercaping mencangkul, menanam bibit, lalu menyiram |
| 2 | Tumbuh | Siang–malam & hujan tropis, pohon tumbuh dari tahun 1 sampai 6 |
| 3 | Panen | Kuncup berubah hijau ke merah muda, dipetik dari tangga bambu ke keranjang |
| 4 | Penjemuran | 4 hari di atas tikar, warna berubah jadi cokelat tua, ditutup "kadar air ≤10%" |
| 5 | Sortir & QC | Uji lab + dokumen (Phyto, CoA, Halal), dikemas di karung goni 50 kg berlogo NJ |
| 6 | Pengiriman | Truk Nganjuk ke Surabaya, crane memuat kontainer, kapal berlayar ke 12 negara tujuan |
| 7 | Tiba | Kapal sandar, karung diturunkan, pembeli membuka dan senang |
| – | Outro | Logo cengkeh + "Where spice meets global standards" + tombol **Request offer** |

Fitur: teks dua bahasa EN/ID (otomatis mengikuti `<html lang>`), efek ketik ala dialog game, progress bar yang bisa di-drag, musik chiptune (mati secara default, pengunjung bisa menyalakannya), otomatis main saat terlihat di layar dan berhenti saat di-scroll lewat, menghormati `prefers-reduced-motion`, responsif sampai layar HP.

## Coba lokal

```bash
npx serve .      # atau: python3 -m http.server
# buka http://localhost:3000 (atau :8000)
```

## Pasang di nusajawa.vercel.app

### HTML biasa

```html
<script src="/clove-story.js" defer></script>

<section id="journey">
  <clove-story accent="#b5562c" cta-href="#contact"></clove-story>
</section>
```

Halaman `/id/` otomatis tampil dalam Bahasa Indonesia kalau `<html lang="id">`. Bisa juga dipaksa:

```html
<clove-story lang="id" cta-href="/id/#contact"></clove-story>
```

### Next.js (App Router)

1. Salin `clove-story.js` ke folder `public/`.
2. Buat komponen:

```tsx
// components/CloveStory.tsx
import Script from 'next/script';

export default function CloveStory({ lang = 'en' }: { lang?: 'en' | 'id' }) {
  return (
    <>
      <Script src="/clove-story.js" strategy="lazyOnload" />
      <clove-story
        lang={lang}
        accent="#b5562c"
        cta-href={lang === 'id' ? '/id/#contact' : '#contact'}
      />
    </>
  );
}
```

3. Supaya TypeScript kenal tag-nya, tambahkan `types/clove-story.d.ts`:

```ts
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type CloveStoryProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  accent?: string; brand?: string; tagline?: string;
  'cta-href'?: string; 'cta-text'?: string;
  'no-autoplay'?: boolean; 'no-loop'?: boolean; 'no-fonts'?: boolean;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements { 'clove-story': CloveStoryProps; }
  }
}
```

Saran tempat: di antara section **Origin** dan **Markets**, karena ceritanya melanjutkan "Grown in East Java, owned by us" sampai ke daftar negara tujuan.

## Pengaturan

| Atribut | Default | Fungsi |
|---------|---------|--------|
| `lang` | ikut `<html lang>` | `en` atau `id` |
| `accent` | `#b5562c` | warna brand (tombol, kontainer, cerobong kapal, dasi pembeli, karung). Harus hex 6 digit |
| `brand` | `Nusajawa Clove` | judul di intro & outro |
| `tagline` | "Where spice meets global standards" / "Rempah Nusantara, standar dunia" | subjudul outro |
| `cta-href` | tidak ada | kalau diisi, tombol muncul di adegan terakhir |
| `cta-text` | "Request offer" / "Minta penawaran" | label tombol |
| `no-autoplay` | – | jangan main otomatis saat terlihat |
| `no-loop` | – | berhenti di outro (tombol CTA tetap tampil) |
| `no-fonts` | – | jangan memuat Google Fonts (Press Start 2P + VT323); pakai font monospace bawaan |

CSS dari luar: `clove-story { --radius: 0 }`, `clove-story::part(frame)`, `clove-story::part(cta)`.

JS: `el.play()`, `el.pause()`, `el.seek(detik)`, `el.duration`.

## Cara kerjanya

- Semua digambar di kanvas 320×180 piksel lalu diperbesar dengan `image-rendering: pixelated`, jadi tetap tajam di layar sebesar apa pun.
- Setiap adegan adalah fungsi murni dari waktu `(t, p)`. Tidak ada state atau partikel yang disimpan, jadi seek/scrub ke detik mana pun selalu hasilnya sama.
- Sprite (petani, pembeli, karung, cengkeh) ditulis sebagai array string ASCII di dalam kode. Mau ganti warna baju petani? Ubah `PAL_FARMER`.
- Teks narasi dan urutan adegan ada di `SCENES`, gampang diedit kalau mau mengubah kalimat.
