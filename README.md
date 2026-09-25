# ☁️ Bulut, Top ve Su Macerası ⚽

5 yaş civarı çocuklar için, **kamerayla vücut hareketleri** algılanarak oynanan basit bir platform oyunu.
Telefon, tablet ve bilgisayar tarayıcısında çalışır; kurulum gerektirmez.

## Nasıl oynanır?

| Engel | Ne yapmalı? | Yapamazsa ne olur? |
|---|---|---|
| ☁️ **Bulut** (üstten gelir) | Aşağı **eğil** ya da buluta **üfle** (bulut dönerek uçar gider) | Bulut fırtınaya döner (şimşek ve yağmur), karakter ıslanır. Oyun devam eder. |
| ⚽ **Top** (yerde yuvarlanır) | Topa **vur** (tekme) | Karakter topa çarpar ve bir **takla** atar. Oyun devam eder. |
| 💧 **Su birikintisi** (yerde) | Üstünden **zıpla** | Su sıçrar, karakterin üstü **ıslanır** (elbise koyulaşır, damlalar düşer). Oyun devam eder. |

- Oyunda **kaybetmek yok**. Her başarı ⭐ kazandırır, her 10 yıldızda konfeti patlar.
- Engel yaklaşınca ekranda büyük bir uyarı çıkar ve Türkçe sesli yönlendirme yapılır ("Bulut geliyor! Eğil ya da üfle!").
- Çocuk kadrajdan çıkarsa oyun onu bekler ("Seni göremiyorum 👀").
- Kamerasız oynamak için **Dokunarak Oyna** modu vardır (Eğil / Üfle / Tekme / Zıpla düğmeleri). Bu modda da telefona üflemek çalışır.
- Klavye: `↓` eğil, `↑` / boşluk zıpla, `→` tekme, `B` üfle, `P` mola.

## Üfleme nasıl algılanıyor?

İki yol birlikte çalışır, hangisi önce yakalarsa bulut uçar:

1. **Yüzden:** Pozdan kafanın yeri bulunur, o bölge büyütülüp MediaPipe Face Landmarker'a verilir.
   Dudak büzme (`mouthPucker`, `mouthFunnel`) ya da yanak şişirme (`cheekPuff`) skoru 0,4'ü geçerse üfleme sayılır.
   Çocuk uzakta olduğu için yüz küçük görünür; ışık iyi olmalı ve yüz kameraya dönük olmalı.
2. **Mikrofondan:** Üfleme sesi gürültü gibidir, konuşma ise belirli tonlarda yoğunlaşır. Ses ortamın
   16 dB üstündeyse ve spektrum "düz" ise (spektral düzlük > 0,18) üfleme sayılır. Oyunun kendi sesleri
   ve konuşması çalarken mikrofon yok sayılır. Mikrofon izni isteğe bağlıdır; verilmezse sadece yüzden algılanır.
   2–3 metreden üfleme zayıf duyulabilir; "fuuu" diye sesli üflemek en iyi sonucu verir.

Eşikler `js/pose.js` (`BLOW_ON`) ve `js/blow.js` (`LEVEL_DB`, `FLATNESS`) dosyalarının başında.

## Çalıştırma

Kamera erişimi için tarayıcılar sayfanın **https** ya da **localhost** üzerinden açılmasını ister.

**Bilgisayarda (en kolayı):**

```bash
cd mobile-game
python3 -m http.server 8000
# tarayıcıda: http://localhost:8000
```

**Telefonda / tablette:** Klasörü https veren bir yerde yayınlayın. Örneğin GitHub Pages
(repo → Settings → Pages → dal ve klasör seçimi) ya da Netlify / Vercel'e sürükle-bırak.
Sonra adresi telefonda açıp **Kamerayla Oyna**'ya dokunun ve kamera iznini verin.

İnternet bağlantısı gerekir: hareket algılama kütüphanesi (MediaPipe) ve modeli ilk açılışta indirilir.

### Tek dosyalık sürüm

`bulut-ve-kaya-macerasi.html`, oyunun tüm CSS ve JS'i içine gömülü tek dosyalık halidir.
Paylaşmak ya da bir yere yüklemek için bu dosya yeterlidir. Bilgisayarda çift tıklayarak açılabilir.
Telefonda kamera için yine https bir adresten açılması gerekir.

Kaynak dosyalarda (`index.html`, `style.css`, `js/`) değişiklik yaptıktan sonra tek dosyayı yenileyin:

```bash
python3 tek_dosya_olustur.py
```

## Kurulum ipuçları (ebeveyn için)

1. Cihazı **yatay** ve bel hizasında sabitleyin, ön kamera çocuğa baksın.
2. Çocuk **2–3 adım** geride dursun; başından ayaklarına kadar görünsün.
3. İlk ekranda birkaç saniye dik durması yeterli; oyun kendi duruşuna göre ayar yapar. Mikrofon izni de sorulur (üfleme için).
4. Algılama kaçarsa sağ üstteki 🎯 düğmesiyle yeniden ayar yapabilirsiniz.
5. Kamera görüntüsü **cihazdan dışarı gönderilmez**; tüm işlem tarayıcı içinde yapılır.

## Hareket algılama nasıl çalışıyor?

`js/pose.js`, MediaPipe Pose Landmarker (lite model) ile her karede 33 vücut noktası bulur.
Başlangıçta çocuğun dik duruşu kaydedilir. Tüm eşikler, çocuğun **gövde boyuna** (omuz → kalça) oranla
hesaplanır. Böylece kameraya uzaklık fark etmez.

| Hareket | Kural |
|---|---|
| Eğilme | Omuzlar ya da burun, gövde boyunun ≈ %35'i kadar aşağı indi |
| Zıplama | Kalça **ve** omuzlar birlikte ≈ %15 yükseldi |
| Tekme | Bir diz kalçaya doğru kalktı ya da iki ayak bileği arasında büyük yükseklik farkı oluştu |
| Üfleme | Yukarıdaki "Üfleme nasıl algılanıyor?" bölümüne bakın |

Eşikler `js/pose.js` dosyasının başındaki sabitlerden kolayca ayarlanabilir.

## Dosyalar

```
mobile-game/
├── bulut-ve-kaya-macerasi.html  tek dosyalık sürüm (otomatik üretilir)
├── tek_dosya_olustur.py         tek dosyalık sürümü üreten betik
├── index.html     ekranlar (başlangıç, ayar, mola) ve kontroller
├── style.css      arayüz stilleri
└── js/
    ├── game.js    oyun döngüsü, karakter/engel çizimi, kurallar ve efektler
    ├── pose.js    kameradan hareket ve yüzden üfleme algılama
    ├── blow.js    mikrofondan üfleme algılama
    └── audio.js   ses efektleri (WebAudio) ve Türkçe sesli yönlendirme
```

Tüm grafikler kodla çizilir; ek görsel ya da ses dosyası yoktur.
