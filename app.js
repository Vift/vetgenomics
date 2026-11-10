(function () {
  var D = window.VG;
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBody = document.getElementById('modal-body');
  var STORE_KEY = 'vg_shop_v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmt(n) {
    return Number(n).toLocaleString('ru-RU') + ' ₽';
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* ---------- store ---------- */

  function defaultStore() {
    return { pets: [], cart: [], paper: false, kennel: false, kitsOn: false, seq: 1 };
  }

  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.pets && s.cart) return s;
    } catch (e) {}
    return defaultStore();
  }

  var store = loadStore();

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    updateBadge();
  }

  function uid() {
    return 'i' + (store.seq++) + '_' + Date.now().toString(36);
  }

  function updateBadge() {
    var badge = document.getElementById('cart-badge');
    if (!badge) return;
    var n = store.cart.reduce(function (acc, it) {
      if (it.kind === 'kit') return acc + (it.qty || 0);
      return acc + 1;
    }, 0);
    badge.textContent = n;
    badge.style.display = n ? '' : 'none';
  }

  function cartTests() {
    return store.cart.filter(function (it) { return it.kind === 'test'; });
  }

  function petById(id) {
    for (var i = 0; i < store.pets.length; i++) if (store.pets[i].id === id) return store.pets[i];
    return null;
  }

  function kitFor(petId) {
    for (var i = 0; i < store.cart.length; i++) {
      if (store.cart[i].kind === 'kit' && store.cart[i].petId === petId) return store.cart[i];
    }
    return null;
  }

  function ensureKits() {
    if (!store.kitsOn) {
      store.cart = store.cart.filter(function (it) { return it.kind !== 'kit'; });
      return;
    }
    var seen = {};
    cartTests().forEach(function (t) {
      if (!seen[t.petId] && petById(t.petId)) {
        seen[t.petId] = true;
        if (!kitFor(t.petId)) {
          store.cart.push({ id: uid(), petId: t.petId, kind: 'kit', name: 'Набор для сбора биоматериала', price: D.pricing.kitPrice, qty: 1 });
        }
      }
    });
    store.cart = store.cart.filter(function (it) {
      if (it.kind !== 'kit') return true;
      return petById(it.petId) && cartTests().some(function (t) { return t.petId === it.petId; });
    });
  }

  function calc() {
    var tests = cartTests();
    var testsSum = tests.reduce(function (a, t) { return a + t.price; }, 0);
    var profilesSum = tests.reduce(function (a, t) { return a + (t.profile ? t.price : 0); }, 0);
    var kitsQty = 0, kitsSum = 0;
    store.cart.forEach(function (it) {
      if (it.kind === 'kit') { kitsQty += it.qty || 0; kitsSum += (it.qty || 0) * it.price; }
    });
    var certSum = store.paper ? tests.length * D.pricing.certPrice : 0;
    var base = testsSum + kitsSum + certSum;
    var tierPct = 0;
    D.pricing.tiers.forEach(function (t) { if (base >= t.min) tierPct = t.pct; });
    if (base === 0) tierPct = 0;
    var discountable = base - profilesSum;
    var tierDiscount = Math.round(discountable * tierPct / 100);
    var kennelDiscount = store.kennel ? Math.round(base * D.pricing.kennelPct / 100) : 0;
    var total = base - tierDiscount - kennelDiscount;
    return {
      tests: tests, testsSum: testsSum, profilesSum: profilesSum,
      kitsQty: kitsQty, kitsSum: kitsSum, certSum: certSum, base: base,
      tierPct: tierPct, kennelPct: store.kennel ? D.pricing.kennelPct : 0,
      tierDiscount: tierDiscount, kennelDiscount: kennelDiscount,
      discount: tierDiscount + kennelDiscount, total: total
    };
  }

  /* ---------- shared blocks ---------- */

  function testRow(t, ctx) {
    var badges = '';
    if (t.profile) badges += ' <span class="badge">профиль</span>';
    if (t.common) badges += ' <span class="badge common">часто в породе</span>';
    var extra = ctx
      ? '<button class="btn small gold add-btn" data-name="' + esc(t.name) + '">＋ В корзину</button>'
      : '';
    return '<div class="test-row' + (t.profile ? ' profile' : '') + '" data-name="' + esc(t.name) + '">' +
      '<div class="test-name">' + esc(t.name) + badges +
      (t.code ? '<small>Код: ' + esc(t.code) + '</small>' : '') + '</div>' +
      (t.term ? '<div class="test-term">' + esc(t.term) + ' раб. дн.</div>' : '') +
      '<div class="test-price">' + (t.old ? '<span class="old">' + fmt(t.old) + '</span>' : '') + fmt(t.price) + '</div>' +
      extra + '</div>';
  }

  function testsBlock(title, tests, ctx) {
    if (!tests || !tests.length) return '';
    return '<section class="section"><h2 class="sec-title">' + esc(title) + '</h2><div class="test-list">' +
      tests.map(function (t) { return testRow(t, ctx); }).join('') + '</div></section>';
  }

  function kitBlock() {
    return '<div class="kit-box"><strong>Набор для сбора биоматериала — ' + fmt(D.pricing.kitPrice) + '</strong>' +
      '<p style="font-size:14px;margin-top:6px">Фирменный набор: направления, зонды, конверты для биоматериала и почтовый конверт с адресом лаборатории. ' +
      'Наборы добавляются в корзине отдельной опцией (по умолчанию — без наборов). Собрать образец можно и подручными средствами — см. <a href="#/sampling">инструкцию</a>.</p></div>';
  }

  /* ---------- views ---------- */

  function viewHome() {
    return '<section class="hero">' +
      '<div><h1>Генетические тесты для ваших животных</h1>' +
      '<p>Наследственные заболевания, окрасы и типы шерсти, ДНК-паспорта и комплексный тест КанОмикс. Соберите заказ для нескольких питомцев — скидка зависит от суммы.</p>' +
      '<div class="hero-actions">' +
      '<a class="btn" href="#/dogs">Выбрать вид и породу</a>' +
      '<a class="btn ghost" href="#/canomix">О тесте КанОмикс</a></div></div>' +
      '<div class="hero-side"><h3>Как это работает</h3><ul>' +
      '<li>Выберите породу и тесты</li>' +
      '<li>Добавьте тесты для каждого питомца</li>' +
      '<li>Наборы — по числу животных</li>' +
      '<li>Бумажные сертификаты и скидка питомникам</li>' +
      '<li class="big">Скидки до 20%</li></ul></div></section>' +

      '<section class="section"><h2 class="sec-title">Выберите вид животного</h2>' +
      '<div class="grid cols-3">' +
      '<a class="sp-card" href="#/dogs"><div class="emoji">🐶</div><h3>Собаки</h3><p>186 пород, профили заболеваний, окрасы и типы шерсти</p></a>' +
      '<a class="sp-card" href="#/cats"><div class="emoji">🐱</div><h3>Кошки</h3><p>Породные панели, группа крови, окрасы</p></a>' +
      '<a class="sp-card" href="#/horses"><div class="emoji">🐴</div><h3>Лошади</h3><p>Наследственные заболевания, масти, ДНК-паспорт</p></a>' +
      '</div></section>' +

      '<section class="section"><h2 class="sec-title">Больше сумма заказа = больше скидка</h2>' +
      '<div class="grid cols-4">' +
      D.pricing.tiers.map(function (t) {
        return '<div class="tier"><div class="pct">' + t.pct + '%</div><div class="from">от ' + fmt(t.min) + '</div></div>';
      }).join('') +
      '<div class="tier"><div class="pct">+5%</div><div class="from">владельцам питомников</div></div>' +
      '</div></section>';
  }

  function viewSpecies(spKey) {
    var sp = D.species[spKey];
    if (!spKey || !sp) return viewHome();
    if (!sp.hasBreeds) return viewHorses();
    var breeds = sp.breeds.map(function (b) {
      return '<a class="breed-link" href="#/' + spKey + '/' + encodeURIComponent(b.name) + '">' +
        esc(b.name) + '<small>' + b.tests.length + ' ' + plural(b.tests.length, 'тест', 'теста', 'тестов') + '</small></a>';
    }).join('');
    return '<h1 class="page-title">' + esc(sp.label) + '</h1>' +
      '<p class="page-sub">Выберите породу — на её странице можно добавить тесты в корзину для каждого питомца.</p>' +
      '<div class="breed-tools"><input type="text" id="breed-search" placeholder="Поиск породы…" autocomplete="off"></div>' +
      '<div class="breed-grid" id="breed-grid">' + breeds + '</div>';
  }

  function findBreed(spKey, breedName) {
    var sp = D.species[spKey];
    if (!sp || !sp.hasBreeds) return null;
    for (var i = 0; i < sp.breeds.length; i++) {
      if (sp.breeds[i].name === breedName) return sp.breeds[i];
    }
    return null;
  }

  function viewBreed(spKey, breedName) {
    var sp = D.species[spKey];
    var breed = findBreed(spKey, breedName);
    if (!breed) return '<h1 class="page-title">Порода не найдена</h1><p><a href="#/' + spKey + '">К списку пород</a></p>';

    var ctx = { species: spKey, breed: breedName, tests: breed.tests.concat(sp.colors) };
    window.__ctx = ctx;

    return '<p style="font-size:13px"><a href="#/' + spKey + '">← ' + esc(sp.label) + '</a></p>' +
      '<h1 class="page-title">' + esc(breed.name) + '</h1>' +
      '<p class="page-sub">Выберите тесты и добавьте их в корзину — система предложит указать питомца. Тесты добавляются для конкретного животного этой породы.</p>' +
      testsBlock('Заболевания и профили', breed.tests, true) +
      testsBlock('Окрасы и типы шерсти', sp.colors, true) +
      (sp.hasKits ? kitBlock() : '') +
      '<a class="btn" href="#/cart">Перейти в корзину</a>';
  }

  function viewHorses() {
    var sp = D.species.horses;
    var ctx = { species: 'horses', breed: null, tests: sp.tests.concat(sp.colors).concat([sp.dna]) };
    window.__ctx = ctx;
    return '<h1 class="page-title">Лошади</h1>' +
      '<p class="page-sub">Наследственные заболевания, генетика мастей и ДНК-паспорт. Тесты добавляются в корзину для конкретной лошади.</p>' +
      testsBlock('Наследственные заболевания', sp.tests, true) +
      testsBlock('Генетика окрасов (масти)', sp.colors, true) +
      '<section class="section"><h2 class="sec-title">Установление родства, ДНК-паспорт</h2>' +
      '<div class="card prose"><p>Для установления родства необходимо оформить ДНК-паспорт на всех животных. Родство устанавливается только между жеребятами и их родителями. Определение родства по паспортам нашей лаборатории — бесплатно для клиентов.</p>' +
      testRow(sp.dna, true) + '</div></section>' +
      '<a class="btn" href="#/cart">Перейти в корзину</a>';
  }

  function viewCanomix() {
    var c = D.canomix;
    var t = { name: c.name, code: c.code, price: c.price, old: c.old, term: '60' };
    window.__ctx = { species: 'dogs', breed: null, tests: [t], canomix: true };
    return '<h1 class="page-title">' + esc(c.name) + '</h1>' +
      '<p class="page-sub">Наиболее полный генетический тест нового поколения для собак: здоровье, внешность, идентификация, происхождение и геномные параметры.</p>' +
      '<div class="grid cols-2">' +
      '<div class="card"><h2 class="sec-title">Стоимость</h2>' +
      '<div class="test-price" style="font-size:30px"><span class="old">' + fmt(c.old) + '</span>' + fmt(c.price) + '</div>' +
      '<p style="color:var(--muted);margin:8px 0 14px">Срок выполнения: ' + esc(c.term) + '.</p>' +
      testRow(t, true) + '</div>' +
      '<div class="card"><h2 class="sec-title">Что входит в исследование</h2>' +
      c.sections.map(function (s) {
        return '<h4 style="color:var(--blue-dark);margin:12px 0 6px">' + esc(s.title) + '</h4><ul style="margin-left:18px;font-size:14px">' +
          s.items.map(function (it) { return '<li style="margin-bottom:4px">' + esc(it) + '</li>'; }).join('') + '</ul>';
      }).join('') + '</div></div>' +
      '<section class="section card prose" style="margin-top:16px"><h2 class="sec-title">Как проходит исследование</h2>' +
      '<p>Отчёт включает сводку результатов и описание генотипов, обнаруженные варианты, ассоциированные с наследственными заболеваниями (клинические описания и интерпретация генотипа), атлас окрасов с визуализацией предсказанного фенотипа, генетический паспорт по стандартам ISAG 2006 (225 SNP-маркеров), идентификацию породы, митохондриальную ДНК и популяционные характеристики.</p>' +
      '<p>Достаточно собрать биоматериал дома — 6 палочек (см. <a href="#/sampling">инструкцию</a>).</p></section>';
  }

  function viewSampling() {
    return '<h1 class="page-title">Сбор биоматериала</h1>' +
      '<p class="page-sub">Собрать образец можно дома за несколько минут. Два способа: нашим фирменным набором или подручными средствами.</p>' +
      '<div class="tabs">' +
      '<button class="tab active" data-tab="kit">С использованием наших наборов</button>' +
      '<button class="tab" data-tab="diy">Подручными средствами</button></div>' +
      '<div class="card prose" id="tab-kit">' + D.sampling.kit + '</div>' +
      '<div class="card prose" id="tab-diy" style="display:none">' + D.sampling.diy +
      '<div class="img-block"><img src="assets/diy.jpg" alt="Инструкция: как собрать ДНК животного дома"></div></div>';
  }

  function viewDiscounts() {
    return '<h1 class="page-title">Скидки</h1>' +
      '<p class="page-sub">Больше сумма заказа — больше скидка. Скидка не зависит от числа тестов на одно животное и помётов.</p>' +
      '<div class="grid cols-3">' +
      D.pricing.tiers.map(function (t) {
        return '<div class="tier"><div class="pct">' + t.pct + '%</div><div class="from">На заказы суммой от ' + fmt(t.min) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="card" style="margin-top:16px"><h2 class="sec-title">+ Скидка 5% питомникам</h2>' +
      '<p>Владельцам, у которых зарегистрирован питомник либо имеется свидетельство о регистрации заводской приставки, предоставляется дополнительная скидка 5%. Имя в документе о регистрации должно совпадать с именем заказчика.</p></div>';
  }

  function viewLegal(kind) {
    var title = kind === 'privacy' ? 'Политика обработки персональных данных' : 'Публичная оферта';
    return '<h1 class="page-title">' + title + '</h1>' +
      '<div class="card prose"><div class="doc">' + (kind === 'privacy' ? D.legal.privacy : D.legal.offer) + '</div></div>';
  }

  /* ---------- cart ---------- */

  function viewCart() {
    ensureKits();
    save();

    var tests = cartTests();
    if (!tests.length) {
      return '<h1 class="page-title">Корзина</h1>' +
        '<div class="card"><p>Корзина пуста. Выберите <a href="#/dogs">породу</a> или <a href="#/canomix">тест КанОмикс</a> и добавьте тесты для ваших питомцев.</p></div>';
    }

    var groups = {};
    var order = [];
    tests.forEach(function (t) {
      if (!groups[t.petId]) { groups[t.petId] = []; order.push(t.petId); }
      groups[t.petId].push(t);
    });

    var groupsHtml = order.map(function (petId) {
      var pet = petById(petId) || { name: 'Питомец', species: '', breed: '' };
      var spLabel = D.species[pet.species] ? D.species[pet.species].label : pet.species;
      var items = groups[petId].map(function (t) {
        return '<div class="cart-item"><div class="nm">' + esc(t.name) +
          (t.code ? ' <span class="test-code">' + esc(t.code) + '</span>' : '') + '</div>' +
          '<div class="pr">' + fmt(t.price) + '</div>' +
          '<button class="link-btn" data-remove="' + t.id + '">убрать</button></div>';
      }).join('');
      var kit = kitFor(petId);
      var kitHtml = D.species[pet.species] && D.species[pet.species].hasKits && kit ? (
        '<div class="cart-item"><div class="nm">Набор для сбора биоматериала <span class="test-code">' + fmt(D.pricing.kitPrice) + ' / шт</span></div>' +
        '<div class="qty"><button data-qty="' + kit.id + '" data-d="-1">−</button>' +
        '<input type="text" readonly value="' + kit.qty + '">' +
        '<button data-qty="' + kit.id + '" data-d="1">＋</button></div>' +
        '<div class="pr">' + fmt(kit.qty * kit.price) + '</div></div>'
      ) : '';
      return '<div class="cart-pet"><h3>🐾 ' + esc(pet.name) +
        ' <span class="test-code">' + esc(spLabel) + (pet.breed ? ' · ' + esc(pet.breed) : '') + '</span>' +
        ' <button class="link-btn" data-remove-pet="' + petId + '">удалить питомца</button></h3>' +
        items + kitHtml + '</div>';
    }).join('');

    var c = calc();

    return '<h1 class="page-title">Корзина</h1>' +
      '<p class="page-sub">Тесты привязаны к конкретным питомцам. Проверьте состав заказа и оформите заявку.</p>' +
      '<div class="grid" style="grid-template-columns: 1.5fr 1fr; align-items:start">' +
      '<div>' + groupsHtml +
      '<div class="card" style="margin-top:14px">' +
      '<label class="check-line"><input type="checkbox" id="opt-kits"' + (store.kitsOn ? ' checked' : '') + '>' +
      '<span><strong>Добавить наборы для сбора биоматериала</strong> — по одному на животное, ' + fmt(D.pricing.kitPrice) + ' за набор. Можно собрать материал и подручными средствами.</span></label>' +
      '<label class="check-line"><input type="checkbox" id="opt-paper"' + (store.paper ? ' checked' : '') + '>' +
      '<span><strong>Бумажные сертификаты</strong> — +' + fmt(D.pricing.certPrice) + ' за каждый тест (сейчас ' + c.tests.length + ' ' + plural(c.tests.length, 'тест', 'теста', 'тестов') + '). Без отметки выдаются электронные версии.</span></label>' +
      '<label class="check-line"><input type="checkbox" id="opt-kennel"' + (store.kennel ? ' checked' : '') + '>' +
      '<span><strong>Я владелец питомника</strong> — дополнительная скидка ' + D.pricing.kennelPct + '% на весь заказ (нужна регистрация питомника или заводской приставки на имя заказчика).</span></label>' +
      '</div></div>' +

      '<div class="card summary">' +
      '<h2 class="sec-title">Итого</h2>' +
      '<div class="sum-row"><span>Тесты</span><span>' + fmt(c.testsSum) + '</span></div>' +
      '<div class="sum-row"><span>Наборы (' + c.kitsQty + ' × ' + fmt(D.pricing.kitPrice) + ')</span><span>' + fmt(c.kitsSum) + '</span></div>' +
      (store.paper ? '<div class="sum-row"><span>Бумажные сертификаты</span><span>' + fmt(c.certSum) + '</span></div>' : '') +
      '<div class="sum-row"><span>Сумма</span><span>' + fmt(c.base) + '</span></div>' +
      (c.tierDiscount ? '<div class="sum-row disc"><span>Скидка за сумму ' + c.tierPct + '% (без учёта комплексов)</span><span>−' + fmt(c.tierDiscount) + '</span></div>' : '') +
      (c.kennelDiscount ? '<div class="sum-row disc"><span>Скидка питомника ' + c.kennelPct + '%</span><span>−' + fmt(c.kennelDiscount) + '</span></div>' : '') +
      '<div class="sum-row total"><span>К оплате</span><span>' + fmt(c.total) + '</span></div>' +
      (c.profilesSum ? '<p style="font-size:12px;color:var(--muted);margin-top:8px">В цену породных комплексов (профилей) скидка за сумму уже включена — к ним применяется только скидка питомника.</p>' : '') +

      '<h2 class="sec-title" style="margin-top:18px">Оформление заказа</h2>' +
      '<form id="order-form" novalidate><div class="form-grid">' +
      '<div class="field"><label for="o-name">Имя *</label><input id="o-name" name="name" type="text" maxlength="100" placeholder="Как к вам обращаться"></div>' +
      '<div class="field"><label for="o-phone">Телефон *</label><input id="o-phone" name="phone" type="tel" maxlength="32" placeholder="+7 ___ ___ __ __"></div>' +
      '<div class="field"><label for="o-email">E-mail</label><input id="o-email" name="email" type="email" maxlength="120" placeholder="you@example.com"></div>' +
      '<div class="field"><label for="o-comment">Комментарий</label><textarea id="o-comment" name="comment" rows="3" maxlength="1500" placeholder="Пожелания к заказу, адрес, способ доставки"></textarea></div>' +
      '<label class="consent"><input type="checkbox" id="o-consent"><span>Согласен(на) на обработку персональных данных в соответствии с <a href="#/privacy" target="_blank">политикой</a></span></label>' +
      '<button class="btn gold" type="submit">Отправить заказ</button>' +
      '<p class="form-err" id="order-err"></p></div></form>' +
      '<div class="form-ok" id="order-ok"><h3>Заказ отправлен!</h3><p>Менеджер свяжется с вами для подтверждения и оплаты. Если вопрос срочный — звоните <strong>' + D.config.phone + '</strong>.</p></div>' +
      '</div></div>';
  }

  function orderComment(c) {
    var lines = ['ЗАКАЗ С САЙТА (корзина)'];
    var groups = {};
    var order = [];
    c.tests.forEach(function (t) {
      if (!groups[t.petId]) { groups[t.petId] = []; order.push(t.petId); }
      groups[t.petId].push(t);
    });
    order.forEach(function (petId, i) {
      var pet = petById(petId) || { name: 'Питомец', species: '', breed: '' };
      var spLabel = D.species[pet.species] ? D.species[pet.species].label : pet.species;
      lines.push((i + 1) + '. ' + pet.name + ' (' + spLabel + (pet.breed ? ', ' + pet.breed : '') + '):');
      groups[petId].forEach(function (t) {
        lines.push('   - ' + t.name + (t.code ? ' [' + t.code + ']' : '') + ' — ' + t.price + ' ₽');
      });
      var kit = kitFor(petId);
      if (kit && kit.qty > 0) lines.push('   - Набор для сбора биоматериала × ' + kit.qty + ' — ' + (kit.qty * kit.price) + ' ₽');
    });
    if (store.paper) lines.push('Бумажные сертификаты: да (' + c.tests.length + ' × ' + D.pricing.certPrice + ' ₽ = ' + c.certSum + ' ₽)');
    else lines.push('Бумажные сертификаты: нет (электронные)');
    lines.push('Владелец питомника: ' + (store.kennel ? 'да (+' + D.pricing.kennelPct + '%)' : 'нет'));
    lines.push('Сумма: ' + c.base + ' ₽');
    if (c.tierDiscount) lines.push('Скидка за сумму ' + c.tierPct + '% (комплексы/профили без этой скидки): −' + c.tierDiscount + ' ₽');
    if (c.kennelDiscount) lines.push('Скидка питомника ' + c.kennelPct + '%: −' + c.kennelDiscount + ' ₽');
    lines.push('ИТОГО: ' + c.total + ' ₽');
    return lines.join('\n');
  }

  function bindCart() {
    var kits = document.getElementById('opt-kits');
    if (kits) kits.addEventListener('change', function () {
      store.kitsOn = kits.checked;
      ensureKits();
      save();
      render();
    });

    var paper = document.getElementById('opt-paper');
    if (paper) paper.addEventListener('change', function () {
      store.paper = paper.checked;
      save();
      render();
    });

    var kennel = document.getElementById('opt-kennel');
    if (kennel) kennel.addEventListener('change', function () {
      store.kennel = kennel.checked;
      save();
      render();
    });

    app.querySelectorAll('[data-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        store.cart = store.cart.filter(function (it) { return it.id !== b.getAttribute('data-remove'); });
        ensureKits();
        save();
        render();
      });
    });

    app.querySelectorAll('[data-remove-pet]').forEach(function (b) {
      b.addEventListener('click', function () {
        var petId = b.getAttribute('data-remove-pet');
        store.cart = store.cart.filter(function (it) { return it.petId !== petId; });
        store.pets = store.pets.filter(function (p) { return p.id !== petId; });
        ensureKits();
        save();
        render();
      });
    });

    app.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-qty');
        var d = Number(b.getAttribute('data-d'));
        store.cart.forEach(function (it) {
          if (it.id === id) {
            it.qty = Math.max(0, (it.qty || 0) + d);
            if (it.qty === 0) it.qty = 0;
          }
        });
        save();
        render();
      });
    });

    bindOrderForm();
  }

  function bindOrderForm() {
    var form = document.getElementById('order-form');
    if (!form) return;
    var errBox = document.getElementById('order-err');
    var okBox = document.getElementById('order-ok');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errBox.textContent = '';
      var name = form.elements['name'].value.trim();
      var phone = form.elements['phone'].value.trim();
      var email = form.elements['email'].value.trim();
      var note = form.elements['comment'].value.trim();
      if (name.length < 2) { errBox.textContent = 'Укажите имя.'; return; }
      if (phone.replace(/\D/g, '').length < 10) { errBox.textContent = 'Укажите корректный телефон.'; return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Проверьте адрес e-mail.'; return; }
      if (!document.getElementById('o-consent').checked) { errBox.textContent = 'Отметьте согласие на обработку данных.'; return; }

      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Отправляем…';

      var c = calc();
      var comment = orderComment(c) + (note ? '\nКомментарий клиента: ' + note : '');

      function ok() {
        form.style.display = 'none';
        okBox.style.display = 'block';
      }
      function fail() {
        btn.disabled = false;
        btn.textContent = 'Отправить заказ';
        errBox.textContent = 'Не удалось отправить заказ. Позвоните: ' + D.config.phone + ' или напишите: ' + D.config.email + '.';
      }

      fetch(D.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: name, phone: phone, email: email, comment: comment, source: 'Сайт (корзина)', page: location.href })
      }).then(function (r) {
        if (!r.ok) throw new Error();
        ok();
      }).catch(function () {
        window.location.href = 'mailto:' + D.config.email + '?subject=' + encodeURIComponent('Заказ с сайта') + '&body=' + encodeURIComponent(comment + '\n\nИмя: ' + name + '\nТелефон: ' + phone + '\nE-mail: ' + (email || '—'));
        ok();
      });
    });
  }

  /* ---------- pet modal ---------- */

  function openModal(html) {
    modalBody.innerHTML = html;
    modal.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
  }

  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  function speciesLabel(sp) {
    return D.species[sp] ? D.species[sp].label : sp;
  }

  function openPetModal(test, ctx) {
    var filter = function (p) {
      if (p.species !== ctx.species) return false;
      if (ctx.breed && p.breed !== ctx.breed) return false;
      return true;
    };
    var pets = store.pets.filter(filter);

    var breedField = '';
    if (!ctx.breed && ctx.species === 'dogs') {
      breedField = '<div class="field"><label for="np-breed">Порода</label><select id="np-breed">' +
        D.species.dogs.breeds.map(function (b) {
          return '<option value="' + esc(b.name) + '">' + esc(b.name) + '</option>';
        }).join('') + '</select></div>';
    }

    openModal(
      '<h3>Тест: ' + esc(test.name) + '</h3>' +
      '<p style="color:var(--muted);font-size:14px">Для какого питомца добавить тест? Тест должен подходить животному по породе (' +
      esc(ctx.breed ? ctx.breed : speciesLabel(ctx.species)) + ').</p>' +
      (pets.length ? '<div class="pets-list">' + pets.map(function (p) {
        return '<div class="pet-opt" data-pet="' + p.id + '"><span>🐾 ' + esc(p.name) + '</span><small>' +
          esc(p.breed || speciesLabel(p.species)) + '</small></div>';
      }).join('') + '</div>' : '<p style="margin:10px 0;color:var(--muted)">Питомцев пока нет — создайте первого.</p>') +
      '<div class="divider"></div>' +
      '<h3 style="font-size:15px">Новое животное</h3>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="np-name">Кличка *</label><input id="np-name" type="text" maxlength="60" placeholder="Например, Барсик"></div>' +
      breedField +
      '<button class="btn" id="np-create" type="button">Создать и добавить тест</button>' +
      '<p class="form-err" id="np-err"></p></div>' +
      '<button class="link-btn" id="np-cancel" style="margin-top:12px">Отмена</button>'
    );

    modalBody.querySelectorAll('[data-pet]').forEach(function (el) {
      el.addEventListener('click', function () {
        commitAdd(el.getAttribute('data-pet'), test, ctx);
      });
    });

    document.getElementById('np-cancel').addEventListener('click', closeModal);

    document.getElementById('np-create').addEventListener('click', function () {
      var name = document.getElementById('np-name').value.trim();
      var err = document.getElementById('np-err');
      if (name.length < 1) { err.textContent = 'Укажите кличку.'; return; }
      var breedSel = document.getElementById('np-breed');
      var pet = {
        id: uid(),
        name: name,
        species: ctx.species,
        breed: ctx.breed || (breedSel ? breedSel.value : '')
      };
      store.pets.push(pet);
      commitAdd(pet.id, test, ctx);
    });
  }

  function commitAdd(petId, test, ctx) {
    var dup = store.cart.some(function (it) {
      return it.kind === 'test' && it.petId === petId && it.name === test.name;
    });
    if (dup) {
      document.getElementById('np-err').textContent = 'Этот тест уже добавлен для данного питомца.';
      return;
    }
    store.cart.push({
      id: uid(), petId: petId, kind: 'test',
      name: test.name, code: test.code || '', price: test.price,
      term: test.term || '', profile: test.profile, common: test.common
    });
    if (store.kitsOn && D.species[ctx.species] && D.species[ctx.species].hasKits && !kitFor(petId)) {
      store.cart.push({ id: uid(), petId: petId, kind: 'kit', name: 'Набор для сбора биоматериала', price: D.pricing.kitPrice, qty: 1 });
    }
    save();
    closeModal();
    flashAdd(test.name);
  }

  function flashAdd(name) {
    app.querySelectorAll('.add-btn').forEach(function (b) {
      if (b.getAttribute('data-name') === name) {
        var old = b.textContent;
        b.textContent = '✓ В корзине';
        setTimeout(function () { b.textContent = old; }, 1400);
      }
    });
    updateBadge();
  }

  /* ---------- router ---------- */

  function setActiveNav(key) {
    document.querySelectorAll('.nav a[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === key);
    });
  }

  function render() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').map(decodeURIComponent);
    var key = parts[0] || 'home';
    var html = '';

    switch (key) {
      case '': html = viewHome(); key = 'home'; break;
      case 'dogs': case 'cats':
        html = parts[1] ? viewBreed(key, parts[1]) : viewSpecies(key);
        break;
      case 'horses': html = viewHorses(); break;
      case 'canomix': html = viewCanomix(); break;
      case 'sampling': html = viewSampling(); break;
      case 'discounts': html = viewDiscounts(); break;
      case 'cart': html = viewCart(); break;
      case 'privacy': case 'offer': html = viewLegal(key); break;
      default: html = viewHome(); key = 'home';
    }

    app.innerHTML = html;
    setActiveNav(key);
    document.getElementById('nav').classList.remove('open');
    afterRender();
    updateBadge();
  }

  function afterRender() {
    var search = document.getElementById('breed-search');
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase();
        document.querySelectorAll('#breed-grid .breed-link').forEach(function (el) {
          el.style.display = el.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
      });
    }

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('tab-kit').style.display = tab.getAttribute('data-tab') === 'kit' ? '' : 'none';
        document.getElementById('tab-diy').style.display = tab.getAttribute('data-tab') === 'diy' ? '' : 'none';
      });
    });

    var ctx = window.__ctx;
    app.querySelectorAll('.add-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-name');
        var test = null;
        if (ctx && ctx.tests) {
          for (var i = 0; i < ctx.tests.length; i++) {
            if (ctx.tests[i].name === name) { test = ctx.tests[i]; break; }
          }
        }
        if (!test) test = { name: name, price: 0 };
        openPetModal(test, ctx || { species: 'dogs', breed: null, tests: [test] });
      });
    });

    bindCart();
  }

  document.getElementById('burger').addEventListener('click', function () {
    document.getElementById('nav').classList.toggle('open');
  });

  document.getElementById('year').textContent = new Date().getFullYear();
  window.addEventListener('hashchange', render);
  render();
})();
