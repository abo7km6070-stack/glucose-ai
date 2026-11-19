/* Saudi food database — values per 100 g
   id|Arabic name|category|kcal|protein|fat|carbohydrate|fiber|GI|source|unit name|unit grams|liquid
   Sources:
   SFDA = Saudi Food Composition Tables, Saudi Food & Drug Authority 2026 (lab analysed)
   F25  = Basaqr et al., Frontiers in Nutrition 2025 (ESHA, 25 traditional dishes)
   QD   = AlGeffari et al., Annals of Saudi Medicine 2016 (GI of Saudi dates, Qassim)
   STD  = standard composition / international GI tables (estimate)
   GI of mixed Saudi dishes is a conservative estimate: no published Saudi measurement yet. */
const FOOD_ROWS = `
kabsa_chicken|كبسة دجاج|rice|187|8.4|5.6|26|1.4|65|SFDA|صحن|350
kabsa_lamb|كبسة لحم غنم|rice|158|4.7|6.1|22|1.8|65|SFDA|صحن|350
kabsa_camel|كبسة لحم حاشي|rice|189|7.1|7.3|24.7|2.2|65|SFDA|صحن|350
mandi|مندي|rice|104|5.4|3.9|11.2|0.3|65|F25|صحن|400
bukhari_meat|رز بخاري باللحم|rice|163|5.1|8.1|17.3|0|65|SFDA|صحن|350
bukhari_chicken|رز بخاري بالدجاج|rice|129|5.7|5.6|14|0|65|SFDA|صحن|350
madini_meat|رز مديني باللحم|rice|178|6.5|6.8|24.3|0|65|SFDA|صحن|350
madini_chicken|رز مديني بالدجاج|rice|172|6.6|4.8|25.3|0|65|SFDA|صحن|350
saleeg_chicken|سليق بالدجاج|rice|146|8.3|4.2|18.3|0|75|SFDA|صحن|350
saleeg_meat|سليق باللحم|rice|212|6.6|10.8|21.7|0|75|SFDA|صحن|350
hassawi|رز حساوي|rice|163|6.5|6.1|21|1.5|55|SFDA|صحن|300
timman|تمن|rice|109|6.6|4.5|12.3|3.9|60|SFDA|صحن|300
mansaf|منسف|rice|143|9.1|5.9|13.7|0|60|SFDA|صحن|400
chickpea_rice|رز بالحمص|rice|168|7.2|4.6|26.3|4|55|SFDA|صحن|300
lentil_rice|رز بالعدس|rice|105|2.6|2.9|17.7|1.4|50|SFDA|صحن|300
lakhoufa|لخوفة (لقيمي باللحم)|rice|82|3.8|3|10.3|1.2|60|SFDA|صحن|350
rice_white|رز أبيض سادة|rice|130|2.7|0.3|28.2|0.4|73|STD|كوب|160
rice_basmati|رز بسمتي سادة|rice|121|3.5|0.4|25.2|0.4|58|STD|كوب|160
rice_brown|رز بني|rice|112|2.3|0.8|23.5|1.8|55|STD|كوب|160
sayadiah|صيادية|fish|163|12|6|16.7|3|60|SFDA|صحن|350
fish_muhammar|سمك مع رز محمّر|fish|183|6.9|3.3|32.3|2.6|65|SFDA|صحن|350
fried_fish|سمك مقلي|fish|159|27.7|4.2|2|0|0|SFDA|سمكة|200
musharmal|مشرمل سمك|fish|212|18.7|13.2|8.3|6.3|50|SFDA|صحن|200
khubz_arabi|خبز عربي أبيض|bread|275|9|1.2|55|2.5|75|STD|رغيف|90
tamees|تميس|bread|290|9|3|57|2.5|75|STD|رغيف|150
samoli|صامولي|bread|275|9|3|52|2.4|75|STD|حبة|70
brown_bread|خبز بُر أسمر|bread|250|10|3|45|7|60|STD|رغيف|90
shuraik|شريك|bread|297|9.1|6.7|52.3|4.5|70|SFDA|حبة|80
red_bread|خبز أحمر حساوي|bread|263|8.8|1.6|57.3|9.7|60|SFDA|رغيف|100
khameer_qurs|قرص خمير|bread|349|11.8|11.2|54.7|9.3|65|SFDA|قرص|120
khameerah|خميرة|bread|186|6|1.5|39.7|6.1|65|SFDA|قطعة|120
mathlouthah|مثلوثة|bread|247|5.2|5.7|46.3|6.5|65|SFDA|صحن|200
tawah|طاوة|bread|299|9.9|10.4|45.7|8.2|65|SFDA|قطعة|120
mifa|خبز الميفا|bread|257|9.1|4.4|49|8.2|65|SFDA|رغيف|120
malla|خبز الملة (جمري)|bread|222|10.8|1.6|45.3|9.7|60|SFDA|رغيف|150
muqana|خبز المقنا|bread|225|10|1.1|48|8.8|60|SFDA|رغيف|120
masali|خبز المصالي|bread|186|8.9|1.2|39|9|60|SFDA|رغيف|120
masabeeb|مصابيب|bread|173|5.8|4.1|32.3|8.7|65|SFDA|حبة|100
marasee|مراصيع|bread|233|6.4|8.7|36.3|8.3|65|SFDA|صحن|250
makhameer|مخامير|bread|205|8.5|4.5|36|7.6|65|SFDA|حبة|80
mutabbaq_meat|مطبق لحم|bread|201|9.7|6.6|27|2.3|65|SFDA|حبة|150
mutabbaq_chicken|مطبق دجاج|bread|208|10.1|6.1|28.3|1.3|65|SFDA|حبة|150
aish_laham|عيش لحم|bread|316|13.6|18.5|27.7|7.2|65|SFDA|قطعة|150
aish_dajaj|عيش دجاج|bread|285|13.1|15.4|27.3|6.7|65|SFDA|قطعة|150
mantu|منتو لحم|bread|218|9.6|8.4|27.7|3.3|65|SFDA|٥ حبات|150
fatayer|فطاير جبن|bread|300|10|13|36|1.5|70|STD|حبة|70
sambosa|سمبوسة|bread|300|7|14|30|1.5|65|STD|حبة|40
jareesh|جريش|wheat|163|8.4|7.4|17.3|3.7|55|SFDA|صحن|300
margoug|مرقوق|wheat|98|6|2.5|16|5.7|55|SFDA|صحن|400
qursan|قرصان|wheat|132|3.7|7.5|14.3|4.1|60|SFDA|صحن|350
harees|هريس|wheat|110|5.5|3|15|3|50|STD|صحن|300
tharid|ثريد|wheat|99|5.8|4.5|9.2|0.8|60|F25|صحن|400
thareef|ثريف دخن|wheat|181|6.8|3|35|7.2|60|SFDA|صحن|250
balaleet|بلاليط بالبيض|wheat|168|5.3|4|29.3|3.4|65|SFDA|صحن|250
mbassal|مبصّل|wheat|245|6.6|10.6|35.3|8.9|60|SFDA|صحن|200
mouflag|مفلق بالروبيان|wheat|109|7.6|3.3|15|5.4|55|SFDA|صحن|300
telbanah|تلبينة مالحة|wheat|106|4.1|5.3|12.7|4.6|55|SFDA|صحن|300
couscous_meat|كسكسية باللحم|wheat|119|4.3|7.6|10|3.3|60|SFDA|صحن|300
athan|أذان الشايب|wheat|140|2.9|4.6|25.3|6.2|60|SFDA|صحن|300
tasabee|تصابيع|wheat|135|5.1|4.3|21.7|5.6|60|SFDA|صحن|300
daghabees|دغابيس|wheat|112|6.7|3.1|16.3|4.8|55|SFDA|صحن|300
tashreeba|تشريبة باللحم|wheat|106|4.7|4.5|14.3|5.1|60|SFDA|صحن|400
mulayhiya|مليحية|wheat|154|9.2|7.4|16|6.7|55|SFDA|صحن|300
aseeda_meat|عصيدة بُر باللحم|wheat|60|4.3|1.3|8.7|2.1|55|SFDA|صحن|400
haneeth|حنيذ (اللحم فقط)|meat|282|28.4|17.8|3|1.5|0|SFDA|قطعة|150
hamees|حميس لحم|meat|170|9.6|13.7|3.3|1.5|0|SFDA|صحن|250
maqtoutah|مقطوطة باللحم|meat|320|19.3|25.7|3.7|0|0|SFDA|صحن|200
miro_kabab|كباب ميرو|meat|267|21.8|11.5|22.3|6.6|60|SFDA|٤ أصابع|160
chicken_grill|دجاج مشوي|meat|165|30|7|0|0|0|STD|ربع|180
lamb|لحم غنم مطبوخ|meat|250|25|17|0|0|0|STD|قطعة|150
shawaya|مشاوي لحم|meat|240|26|15|0|0|0|STD|سيخين|150
lentil_soup|شوربة عدس|soup|70|4.5|1.5|10|2.5|35|STD|صحن|300
oats_soup|شوربة شوفان|soup|55|2|1.5|8|1.2|55|STD|صحن|300
matazeez|مطازيز|soup|51|3.3|1.3|8|2.8|55|SFDA|صحن|400
duweifah|دويفة|soup|29|0.6|1.4|5|3|40|SFDA|صحن|300
abeela|عبيلة باللحم|soup|59|6.3|2.7|3.3|0|30|SFDA|صحن|300
okra|مرق بامية|soup|70|3|3|8|3|30|STD|صحن|250
molokhia|ملوخية|soup|60|3|3|6|3|30|STD|صحن|250
saloona|صالونة خضار|soup|65|3|3|7|2.5|40|STD|صحن|250
foul|فول مدمس|breakfast|110|7.5|3|15|5.5|40|STD|صحن|250
hummus|حمص بالطحينة|breakfast|170|8|9|14|6|25|STD|صحن|150
falafel|فلافل|breakfast|330|13|18|32|5|55|STD|٥ حبات|100
shakshuka|شكشوكة|breakfast|120|7|8|5|1.5|30|STD|صحن|250
egg|بيض|breakfast|143|12.6|10|1|0|0|STD|بيضة|50
oats|شوفان بالحليب|breakfast|85|4|2.5|12|1.7|55|STD|صحن|250
cornflakes|كورن فليكس|breakfast|357|7|0.4|84|3|80|STD|كوب|30
honey|عسل|breakfast|304|0.3|0|82|0.2|58|STD|ملعقة|21
labneh|لبنة|dairy|160|6|11|4|0|30|STD|ملعقتين|40
cheese_white|جبن أبيض|dairy|260|15|21|3|0|0|STD|شريحتين|40
yogurt|زبادي|dairy|61|3.5|3.3|4.7|0|35|STD|علبة|170
laban|لبن|dairy|45|3.3|1.5|4.5|0|35|STD|كوب|240|1
milk|حليب|dairy|61|3.2|3.3|4.8|0|35|STD|كوب|240|1
luqaimat|لقيمات بالدبس|sweet|380|5|14|55|1|75|STD|٥ حبات|100
kunafa_cream|كنافة بالقشطة|sweet|417|3.2|25.2|45.7|2|70|SFDA|قطعة|120
kunafa_cheese|كنافة بالجبن|sweet|414|5.5|21.6|49.7|0|70|SFDA|قطعة|120
basbousa|بسبوسة|sweet|360|4|12|52|1|70|STD|قطعة|80
maamoul|معمول|sweet|484|6.6|25.5|60|5.7|60|SFDA|حبة|40
kleja|كليجا|sweet|389|10.8|12.9|62|9.4|60|SFDA|حبة|40
qurs_aqeeli|قرص عقيلي|sweet|363|8.5|16.3|48.3|5.3|65|SFDA|قطعة|80
masoub|معصوب|sweet|233|5.3|6.4|41.3|6.2|65|SFDA|صحن|300
mutabbaq_banana|مطبق موز|sweet|290|7.1|10.1|44|2.3|65|SFDA|حبة|150
mutabbaq_sweetcheese|مطبق جبن حلو|sweet|310|8.9|12.9|40.3|8.6|65|SFDA|حبة|150
jubniyah|جبنية|sweet|417|5.6|19.9|54.3|1.7|70|SFDA|حبة|50
mushabbak|مشبك|sweet|367|2.3|18.9|47.7|1.7|75|SFDA|٣ حبات|60
labaniyah|لبنية|sweet|442|1.2|12.9|79.3|0|70|SFDA|قطعة|50
henaini|حنيني|sweet|320|6.4|10.2|54.3|8|55|SFDA|صحن صغير|150
muhalla|محلى|sweet|187|4.9|4.3|33.7|3.9|55|SFDA|صحن صغير|150
qishd|قشد|sweet|382|3.1|14.3|63.3|7.1|55|SFDA|صحن صغير|100
shaathah|شعثة|sweet|373|9.7|14.5|57|11.8|55|SFDA|صحن صغير|100
haisah|حيسة|sweet|393|4.4|14.7|65.3|9.9|55|SFDA|صحن صغير|100
daleekah|دليكة|sweet|353|9.1|4.4|73|9.6|55|SFDA|صحن صغير|100
mamroos|ممروس|sweet|351|8.4|9.3|63|10|55|SFDA|صحن صغير|100
maqshush|مقشوش|sweet|267|5.8|8|47.3|9.1|60|SFDA|صحن صغير|150
areekah|عريكة|sweet|275|6.9|9.6|45.3|10|55|SFDA|صحن صغير|200
bukayla|بكيلة|sweet|327|4.8|5.5|68.7|9.2|55|SFDA|صحن صغير|100
khawadhah|خواضة (سويق)|sweet|495|8.5|33.5|48.7|5.9|55|SFDA|صحن صغير|100
tuweetat|تويتات|sweet|403|7.8|22.7|43.3|3.3|65|SFDA|قطعة|60
aseeda_wheat|عصيدة بُر حلوة|sweet|177|1.6|5.1|33.7|4.6|60|SFDA|صحن صغير|200
aseeda_white|عصيدة طحين أبيض|sweet|139|1.2|4.3|25.7|3.9|70|SFDA|صحن صغير|200
aseeda_dates|عصيدة تمر|sweet|152|4.1|1.5|34|7|55|SFDA|صحن صغير|200
saqu|ساقو|sweet|250|9.9|7|37.1|1.3|70|F25|كوب|200
cake|كيك|sweet|380|5|17|52|1|65|STD|قطعة|80
ice_cream|آيس كريم|sweet|207|3.5|11|24|0.7|55|STD|كوب صغير|100
chocolate|شوكولاتة بالحليب|sweet|535|7.6|30|59|3.4|45|STD|لوح صغير|40
dates_sukkari|تمر سكري|dates|300|2.2|0.4|75|7|43|QD|تمرة|12
dates_khalas|تمر خلاص|dates|300|2.3|0.4|73|6.5|50|QD|تمرة|10
dates_ajwa|تمر عجوة|dates|290|2.5|0.4|72|7|50|QD|تمرة|10
dates_sagai|تمر صقعي|dates|300|2.2|0.4|74|7|45|QD|تمرة|12
dates_shaqra|تمر شقراء|dates|295|2.2|0.4|73|7|43|QD|تمرة|10
dates_barhi|تمر برحي|dates|290|2.3|0.4|72|6.5|50|QD|تمرة|10
dates_sellaj|تمر سلج|dates|300|2.2|0.4|75|6.5|75|QD|تمرة|10
dates_maktoumi|تمر مكتومي|dates|300|2.2|0.4|75|6.5|71|QD|تمرة|10
rutab|رطب|dates|140|1.5|0.3|33|3.5|50|STD|حبة|15
banana|موز|dates|89|1.1|0.3|23|2.6|51|STD|حبة|120
apple|تفاح|dates|52|0.3|0.2|14|2.4|36|STD|حبة|180
orange|برتقال|dates|47|0.9|0.1|12|2.4|43|STD|حبة|150
watermelon|حبحب|dates|30|0.6|0.2|7.6|0.4|76|STD|شريحة|300
grapes|عنب|dates|69|0.7|0.2|18|0.9|53|STD|كوب|150
mango|مانجو|dates|60|0.8|0.4|15|1.6|51|STD|كوب|165
qahwa|قهوة عربية|drink|2|0.1|0|0.3|0|0|STD|فنجال|50|1
tea_sugar|شاي بسكر|drink|16|0|0|4|0|65|STD|بيالة|100|1
karak|شاي كرك|drink|70|2|2|12|0|60|STD|كوب|200|1
latte|لاتيه بسكر|drink|60|3|2.5|8|0|55|STD|كوب|350|1
juice_orange|عصير برتقال طبيعي|drink|45|0.7|0.2|10.4|0.2|50|STD|كوب|250|1
vimto|فيمتو / عصير محلّى|drink|45|0|0|11|0|65|STD|كوب|250|1
soda|مشروب غازي|drink|42|0|0|10.6|0|63|STD|علبة|355|1
water|ماء|drink|0|0|0|0|0|0|STD|كوب|250|1
burger|برجر|fast|250|13|11|25|1.5|65|STD|ساندويتش|220
shawarma_sand|ساندويتش شاورما دجاج|fast|230|12|10|25|1.5|65|STD|ساندويتش|220
shawarma_plate|صحن شاورما عربي|fast|210|12|10|20|1.5|65|STD|صحن|450
broast|بروست|fast|260|20|15|12|0.5|70|STD|قطعتين|250
pizza|بيتزا|fast|266|11|10|33|2.3|65|STD|شريحة|110
fries|بطاطس مقلية|fast|312|3.4|15|41|3.8|70|STD|وسط|117
falafel_sand|ساندويتش فلافل|fast|230|8|10|28|4|60|STD|ساندويتش|200
pasta|مكرونة بالصلصة|fast|150|5|4|24|2|50|STD|صحن|300
salad|سلطة خضار|salad|35|1|2|4|1.8|15|STD|صحن|150
fattoush|فتوش|salad|100|2|6|10|2|40|STD|صحن|200
tabbouleh|تبولة|salad|120|3|7|13|3|30|STD|صحن|150
veg_cooked|خضار مطبوخة|salad|50|2|1|8|3|40|STD|صحن|200
potato|بطاطس مسلوقة|salad|87|1.9|0.1|20|1.8|78|STD|حبة|150
corn|ذرة|salad|96|3.4|1.5|21|2.4|52|STD|كوز|100
`;
const CATS = [
  ["all","الكل"],["rice","رز"],["wheat","جريش وقمح"],["bread","خبز ومعجنات"],["meat","لحوم"],["fish","أسماك"],
  ["soup","مرق وشوربة"],["breakfast","فطور"],["dairy","ألبان"],["sweet","حلا"],["dates","تمور وفواكه"],
  ["drink","مشروبات"],["fast","مطاعم"],["salad","خضار"]
];
const SRC_NAME = {SFDA:"جداول هيئة الغذاء والدواء ٢٠٢٦",F25:"Basaqr وآخرون ٢٠٢٥",QD:"دراسة تمور القصيم ٢٠١٦",STD:"قيم قياسية (تقدير)",AI:"تقدير تحليل الصورة"};
const FOODS = {};
for (const line of FOOD_ROWS.trim().split("\n")) {
  const [id, ar, cat, kcal, p, fat, c, f, gi, src, unit, ug, liq] = line.split("|");
  FOODS[id] = {id, ar, cat, kcal:+kcal, p:+p, fat:+fat, c:+c, f:+f, gi:+gi, src, unit:[unit, +ug], liquid: liq === "1"};
}
/* lighter swaps: [to, grams of swap per gram of original, label] */
const SWAPS = {
  rice_white:["rice_basmati",1,"رز بسمتي بدل الأبيض"], saleeg_chicken:["jareesh",0.9,"جريش بدل السليق"], saleeg_meat:["jareesh",0.9,"جريش بدل السليق"],
  tea_sugar:["qahwa",0.5,"قهوة عربية بدل الشاي بسكر"], vimto:["laban",1,"لبن بدل العصير المحلّى"], soda:["water",1,"ماء بدل الغازي"],
  juice_orange:["orange",0.6,"حبة برتقال بدل العصير"], karak:["qahwa",0.25,"قهوة عربية بدل الكرك"],
  kunafa_cream:["dates_sukkari",0.2,"تمرتين سكري بدل الكنافة"], kunafa_cheese:["dates_sukkari",0.2,"تمرتين سكري بدل الكنافة"],
  basbousa:["dates_sukkari",0.3,"تمرتين سكري بدل البسبوسة"], luqaimat:["dates_sukkari",0.25,"تمرتين سكري بدل اللقيمات"],
  mushabbak:["dates_sukkari",0.4,"تمرتين سكري بدل المشبك"], labaniyah:["dates_sukkari",0.5,"تمرتين سكري بدل اللبنية"],
  dates_sellaj:["dates_sukkari",1,"تمر سكري بدل السلج (مؤشر أقل)"], dates_maktoumi:["dates_sukkari",1,"تمر سكري بدل المكتومي (مؤشر أقل)"],
  khubz_arabi:["brown_bread",1,"خبز بُر أسمر بدل الأبيض"], tamees:["brown_bread",0.6,"خبز بُر بدل التميس"], samoli:["brown_bread",1,"خبز بُر بدل الصامولي"],
  fries:["salad",1,"سلطة بدل البطاطس"], aseeda_white:["aseeda_dates",1,"عصيدة تمر بدل عصيدة الطحين الأبيض"], cornflakes:["oats",4,"شوفان بدل الكورن فليكس"],
  potato:["veg_cooked",1,"خضار مطبوخة بدل البطاطس"], watermelon:["apple",0.6,"تفاحة بدل الحبحب"]
};
/* Food photos: Wikimedia Commons file titles (CC0 / CC BY / CC BY-SA). Shown via Special:FilePath thumbnails. */
const IMG_TITLES = {
  kabsa_chicken:"Chicken Kabsa.jpg", kabsa_lamb:"Kabsa.jpg", kabsa_camel:"Kabsa.jpg", madini_meat:"Kabsa.jpg", madini_chicken:"Chicken Kabsa.jpg",
  mandi:"Chicken Mandi Rice مندي دجاج.JPG", bukhari_meat:"Bukhari Rice ارز بخاري بالدجاج.JPG", bukhari_chicken:"Bukhari Rice ارز بخاري بالدجاج.JPG",
  saleeg_chicken:"The Hijazi Saleeg.jpg", saleeg_meat:"The Hijazi Saleeg.jpg", mansaf:"Mansaf 1.jpg", sayadiah:"Fish Sayadieh.jpg",
  rice_white:"A bowl of rice.jpg", rice_basmati:"Basmati rice in pot.jpg", rice_brown:"Par cooked brown rice - stonesoup cropped.jpg",
  fried_fish:"Fried Fish 2.jpg", khubz_arabi:"Homemade hummus and pita 03.jpg", samoli:"Iraqi Sammon Bread 04.jpg", brown_bread:"Vegan no-knead whole wheat bread loaf, September 2010.jpg",
  mantu:"Manti (dumpling) In Istanbul.jpg", fatayer:"Fatayer.jpg", sambosa:"Samosa 4.jpg", margoug:"Markouk - Bread on Saje.jpg",
  tharid:"Tharid..JPG", harees:"Al fanar harees (7797136886).jpg", balaleet:"Balaleet 2019.jpg", couscous_meat:"Tunisian couscous with dried meat and braod bean.JPG",
  haneeth:"Overhead view, haneeth, Marib restaurant, Springfield, Virginia.jpg", lamb:"-2020-20-21 Cooked double lamb chops, Trimingham, Norfolk.JPG", shawaya:"Kebab Gerashi.jpg",
  lentil_soup:"Homemade Lentil Soup - Lavash 2025-02-10.jpg", okra:"Bamia-Ocras tomate (cropped).JPG", foul:"Ful medames (arabic meal).jpg", hummus:"Homemade hummus and pita 03.jpg",
  falafel:"Falafel 1.JPG", shakshuka:"Shakshuka by Calliopejen1.jpg", oats:"Banana blueberry oatmeal.jpg", cornflakes:"Corn flakes in a bowl.jpg", honey:"Three French monofloral honey jars.jpg",
  labneh:"Labneh (5196911587).jpg", yogurt:"Yogurt fruit bowl.jpg", laban:"Naneli ayran - Dara.jpg", luqaimat:"Lokma Galata Bridge.JPG",
  kunafa_cream:"Knafeh From Yaffa Knafeh.jpg", kunafa_cheese:"Knafeh From Yaffa Knafeh.jpg", basbousa:"Basboosa.jpg", maamoul:"Mamoul biscotti libanesi.jpg", kleja:"Kleeja 1.JPG",
  masoub:"Yemeni Masoob.jpg", aseeda_dates:"Eating Asida.JPG", aseeda_wheat:"Eating Asida.JPG", cake:"Piece of chocolate cake on a white plate decorated with chocolate sauce.jpg", chocolate:"Milkchocolate with almonds, Aachen, Germany.jpg",
  dates_sukkari:"Sukkary date.jpg", dates_ajwa:"Ajwa dates.JPG", dates_barhi:"Pile of Barhi Dates at Barkin Dogo Market, Kaduna North.jpg", dates_khalas:"Sukkary date.jpg", dates_sagai:"Sukkary date.jpg", dates_shaqra:"Sukkary date.jpg", dates_sellaj:"Sukkary date.jpg", dates_maktoumi:"Sukkary date.jpg",
  banana:"Cavendish banana from Maracaibo.jpg", apple:"Red Apple.jpg", orange:"Oranges - whole-halved-segment.jpg", watermelon:"Watermelon slice, May 2024.jpg", grapes:"Wine grapes03.jpg", mango:"Mangos - single and halved.jpg",
  qahwa:"A dallah a traditional Arabic coffee pot with cups and coffee beans.jpg", tea_sugar:"Glass of tea 05119.jpg", karak:"Chai in the mountains.jpg", juice_orange:"Orange juice 1 edit1.jpg", vimto:"Vimto No Added Sugar 1.jpg",
  shawarma_sand:"Shawarma-sandwich-01.jpg", shawarma_plate:"Plate Shawarma - variant.jpg", broast:"Fried-Chicken-Set.jpg", pizza:"White slice and supreme slice.jpg", falafel_sand:"Falafel Sandwich at Utsunomiya.jpg",
  salad:"Salad platter.jpg", fattoush:"Fattoush mixed-salad.jpg", tabbouleh:"Flickr - cyclonebill - Tabbouleh.jpg", veg_cooked:"Vegetables cooked in the kanoun.jpg"
};
const imgURL = (id, w = 240) => IMG_TITLES[id] ? "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(IMG_TITLES[id]) + "?width=" + w : null;
