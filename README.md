# Polski

Ćwiczenia z polskiego dla dzieci: https://paduszynski.github.io/polski/

Ortografia:
- **Ó czy U?** i **Rz czy Ż?**: słowo z luką i dwa przyciski. Po odpowiedzi strona pokazuje regułę albo dowód (wóz → wozy, morze → morski) i czeka na „Dalej”. Błędne słowa wracają w tej samej rundzie.
- **Dyktando ó/u**: telefon czyta zdanie (synteza mowy pl-PL), dziecko wstawia ó i u. Każde zdanie jest poprawiane „czerwonym długopisem”, a na końcu jest ocena 1–6.

Wiedza o języku:
- **Alfabet**: jaka litera jest po/przed, układanie wyrazów w kolejności alfabetycznej (pierwsza albo druga litera).
- **Litery i głoski**: ile liter, ile głosek; po odpowiedzi rozkład na litery i głoski (dwuznaki, zmiękczenia).
- **Sylaby**: ile sylab i dzielenie wyrazu na sylaby.

Pod każdym ćwiczeniem jest krótka ściąga, a reguła pasująca do odpowiedzi podświetla się. Pełna **Ściąga** ma wszystkie reguły i słowa pokolorowane według postępu.

Dane są na górze skryptu w `index.html`: `OU_BANK`, `RZ_BANK` (luka w nawiasach, reguła, dowód), `DYKTANDA` (każde ó i u w zdaniu staje się luką; odmienione słowa z ó dopisz do `EXTRA_FORMS`), `LG` (głoski rozdzielone kropkami), `SY` (sylaby rozdzielone myślnikami), `AB_WORDS`.

Cała strona to jeden plik `index.html` (GitHub Pages z gałęzi `master`), działa offline i instaluje się z przeglądarki. Przy każdej zmianie podbij wersję (znaczek, stopka, meta, `CACHE` w `sw.js`).
