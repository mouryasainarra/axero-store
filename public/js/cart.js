// cart.js — bag, discount codes, COD, online pay, wishlist, newsletter, search, reviews
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  var money = function (p) { return fmt.format((p || 0) / 100); };
  var PAY = window.AXERO_PAY_READY === true;
  var COD = window.AXERO_COD === true;

  var CART_KEY = 'axero_cart';
  function loadCart(){ try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } }
  function saveCart(c){ localStorage.setItem(CART_KEY, JSON.stringify(c)); }
  var cart = loadCart();
  var stage = 'cart';
  var appliedCode = '', discount = 0;

  function count(){ return cart.reduce(function(n,i){return n+i.qty;},0); }
  function subtotal(){ return cart.reduce(function(n,i){return n+i.qty*i.price;},0); }
  function syncBagBadge(){ var b = $('bagCount'); if (!b) return; var n = count(); b.textContent = n; b.classList.toggle('show', n>0); }

  function addItem(p){
    var ex = cart.find(function(i){ return i.id===p.id && i.size===p.size; });
    if (ex) ex.qty += 1; else cart.push(Object.assign({}, p, { qty: 1 }));
    saveCart(cart); syncBagBadge(); setStage('cart'); discount=0; appliedCode=''; render(); openDrawer();
  }
  function changeQty(idx,d){ cart[idx].qty += d; if (cart[idx].qty<=0) cart.splice(idx,1); saveCart(cart); syncBagBadge(); discount=0; appliedCode=''; render(); }
  function removeItem(idx){ cart.splice(idx,1); saveCart(cart); syncBagBadge(); discount=0; appliedCode=''; render(); }

  function render(){
    var wrap = $('cartItems'); if (!wrap) return;
    var foot = $('cartFoot'), ship = $('shipStep'), proceed = $('proceedBtn'), pay = $('payBtn'), cod = $('codBtn');
    if (!cart.length){
      wrap.innerHTML = '<div class="empty-cart">Your bag is empty.<br>Add something you love.</div>';
      if (foot) foot.style.display='none'; if (ship) ship.style.display='none'; return;
    }
    wrap.innerHTML = cart.map(function(i,idx){
      return '<div class="citem"><div class="thumb">'+(i.img?'<img src="'+i.img+'" alt="">':'')+'</div>'
        + '<div style="flex:1"><p class="cname">'+i.name+'</p>'
        + '<small>Size '+(i.size||'-')+' &middot; '+money(i.price)+'</small>'
        + '<div class="qty"><button data-q="'+idx+'" data-d="-1" aria-label="Decrease">&minus;</button>'
        + '<span>'+i.qty+'</span><button data-q="'+idx+'" data-d="1" aria-label="Increase">+</button>'
        + '<button class="rm" data-rm="'+idx+'">Remove</button></div></div></div>';
    }).join('');
    var sub = subtotal(), tot = Math.max(0, sub - discount);
    var dl = $('discLine');
    if (dl) { if (discount>0){ dl.style.display='flex'; $('discVal').textContent='-'+money(discount); } else dl.style.display='none'; }
    if ($('cartTotal')) $('cartTotal').textContent = money(tot);
    if (foot) foot.style.display='block';
    if (stage === 'ship'){
      if (ship) ship.style.display='block';
      if (proceed) proceed.style.display='none';
      if (pay) pay.style.display = PAY ? 'flex' : 'none';
      if (cod) cod.style.display = COD ? 'flex' : 'none';
    } else {
      if (ship) ship.style.display='none';
      if (proceed) proceed.style.display='flex';
      if (pay) pay.style.display='none';
      if (cod) cod.style.display='none';
    }
  }
  function setStage(s){ stage=s; var t=$('drawerTitle'); if (t) t.textContent = (s==='ship'?'Checkout':'Your bag'); }

  var drawer = $('drawer'), scrim = $('scrim');
  function openDrawer(){ if (drawer){ drawer.classList.add('open'); } if (scrim) scrim.classList.add('open'); }
  function closeAll(){ if (drawer) drawer.classList.remove('open'); var w=$('wishDrawer'); if (w) w.classList.remove('open'); if (scrim) scrim.classList.remove('open'); }
  if ($('bagBtn')) $('bagBtn').addEventListener('click', function(){ render(); openDrawer(); });
  if ($('closeDrawer')) $('closeDrawer').addEventListener('click', closeAll);
  if (scrim) scrim.addEventListener('click', closeAll);

  document.querySelectorAll('.add').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sel = $(btn.dataset.sizeSelect);
      addItem({ id:Number(btn.dataset.id), name:btn.dataset.name, price:Number(btn.dataset.price), img:btn.dataset.img||'', size: sel?sel.value:'' });
    });
  });

  if ($('cartItems')) $('cartItems').addEventListener('click', function(e){
    var q = e.target.closest('[data-q]'); var rm = e.target.closest('[data-rm]');
    if (q) changeQty(Number(q.dataset.q), Number(q.dataset.d));
    if (rm) removeItem(Number(rm.dataset.rm));
  });

  if ($('proceedBtn')) $('proceedBtn').addEventListener('click', function(){
    if (!PAY && !COD){ alert('Checkout is not available yet.'); return; }
    setStage('ship'); render();
    if ($('cartItems')) $('cartItems').scrollIntoView({ behavior:'smooth', block:'start' });
  });

  function shipping(){ return {
    name: val('s_name'), phone: val('s_phone'), email: val('s_email'),
    address: val('s_address'), city: val('s_city'), pincode: val('s_pincode') }; }
  function val(id){ var el=$(id); return el ? (el.value||'').trim() : ''; }
  function validShip(s, errEl){
    if (!s.name || !s.phone || !s.address || !s.pincode){ if(errEl) errEl.textContent='Please fill name, phone, address and PIN code.'; return false; }
    if (!/^[0-9]{10}$/.test(s.phone)){ if(errEl) errEl.textContent='Enter a valid 10-digit phone number.'; return false; }
    if (!/^[0-9]{6}$/.test(s.pincode)){ if(errEl) errEl.textContent='Enter a valid 6-digit PIN code.'; return false; }
    if (errEl) errEl.textContent=''; return true;
  }

  if ($('applyCode')) $('applyCode').addEventListener('click', async function(){
    var code = val('s_code'); var msg = $('codeMsg');
    if (!code){ if(msg){msg.textContent=''; } discount=0; appliedCode=''; render(); return; }
    try {
      var r = await fetch('/api/apply-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code: code, amount: subtotal() }) });
      var d = await r.json();
      if (d.ok){ discount=d.discount; appliedCode=d.code; if(msg){ msg.className='code-msg ok'; msg.textContent='Code applied: -'+money(d.discount); } }
      else { discount=0; appliedCode=''; if(msg){ msg.className='code-msg err'; msg.textContent=d.error||'Invalid code'; } }
    } catch(e){ if(msg){ msg.className='code-msg err'; msg.textContent='Could not check code.'; } }
    render();
  });

  if ($('payBtn')) $('payBtn').addEventListener('click', async function(){
    var s = shipping(), err=$('shipErr'); if (!validShip(s, err)) return;
    var btn=this; btn.disabled=true; btn.textContent='Starting payment…';
    try {
      var res = await fetch('/api/checkout', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ cart: cart.map(function(i){return {id:i.id,qty:i.qty,size:i.size};}), shipping:s, code: appliedCode }) });
      var data = await res.json();
      if (!data.orderId){ alert(data.error||'Could not start checkout.'); resetPay(btn); return; }
      var rzp = new Razorpay({ key:data.keyId, amount:data.amount, currency:data.currency, name:data.name,
        description:'Axero order', order_id:data.orderId, prefill:data.prefill, theme:{ color:'#C9A24B' },
        handler: async function(response){
          var v = await fetch('/api/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(response) });
          var out = await v.json();
          if (out.redirect){ localStorage.removeItem(CART_KEY); window.location = out.redirect; }
          else { alert(out.error||'Payment could not be verified.'); resetPay(btn); }
        }, modal:{ ondismiss:function(){ resetPay(btn); } } });
      rzp.on('payment.failed', function(){ alert('Payment failed. Please try again.'); resetPay(btn); });
      rzp.open();
    } catch(e){ alert('Something went wrong. Please try again.'); resetPay(btn); }
  });
  function resetPay(btn){ btn.disabled=false; btn.textContent='Pay securely'; }

  if ($('codBtn')) $('codBtn').addEventListener('click', async function(){
    var s = shipping(), err=$('shipErr'); if (!validShip(s, err)) return;
    var btn=this; btn.disabled=true; btn.textContent='Placing order…';
    try {
      var res = await fetch('/api/cod-order', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ cart: cart.map(function(i){return {id:i.id,qty:i.qty,size:i.size};}), shipping:s, code: appliedCode }) });
      var out = await res.json();
      if (out.redirect){ localStorage.removeItem(CART_KEY); window.location = out.redirect; }
      else { alert(out.error||'Could not place order.'); btn.disabled=false; btn.textContent='Cash on Delivery'; }
    } catch(e){ alert('Something went wrong. Please try again.'); btn.disabled=false; btn.textContent='Cash on Delivery'; }
  });

  var WISH_KEY = 'axero_wish';
  function loadWish(){ try { return JSON.parse(localStorage.getItem(WISH_KEY)) || []; } catch(e){ return []; } }
  function saveWish(w){ localStorage.setItem(WISH_KEY, JSON.stringify(w)); }
  var wish = loadWish();
  function inWish(id){ return wish.some(function(i){ return i.id===id; }); }
  function syncWishUI(){
    var b=$('wishCount'); if (b){ b.textContent=wish.length; b.classList.toggle('show', wish.length>0); }
    document.querySelectorAll('[data-wish]').forEach(function(btn){ btn.classList.toggle('on', inWish(Number(btn.dataset.id))); });
  }
  function toggleWish(btn){
    var id=Number(btn.dataset.id);
    if (inWish(id)) wish = wish.filter(function(i){ return i.id!==id; });
    else wish.push({ id:id, name:btn.dataset.name, price:Number(btn.dataset.price), img:btn.dataset.img||'' });
    saveWish(wish); syncWishUI(); renderWish();
  }
  document.querySelectorAll('[data-wish]').forEach(function(btn){ btn.addEventListener('click', function(e){ e.preventDefault(); toggleWish(btn); }); });
  function renderWish(){
    var wrap=$('wishItems'); if (!wrap) return;
    if (!wish.length){ wrap.innerHTML='<div class="empty-cart">Your wishlist is empty.</div>'; return; }
    wrap.innerHTML = wish.map(function(i){
      return '<div class="citem"><a class="thumb" href="/product/'+i.id+'">'+(i.img?'<img src="'+i.img+'" alt="">':'')+'</a>'
        +'<div style="flex:1"><a class="cname" href="/product/'+i.id+'">'+i.name+'</a><small>'+money(i.price)+'</small>'
        +'<div class="qty"><button class="rm" data-wadd="'+i.id+'">Add to bag</button><button class="rm" data-wrm="'+i.id+'">Remove</button></div></div></div>';
    }).join('');
  }
  if ($('wishBtn')) $('wishBtn').addEventListener('click', function(){ renderWish(); var w=$('wishDrawer'); if (w) w.classList.add('open'); if (scrim) scrim.classList.add('open'); });
  if ($('closeWish')) $('closeWish').addEventListener('click', closeAll);
  if ($('wishItems')) $('wishItems').addEventListener('click', function(e){
    var add=e.target.closest('[data-wadd]'); var rm=e.target.closest('[data-wrm]');
    if (add){ var it=wish.find(function(i){return i.id===Number(add.dataset.wadd);}); if(it){ addItem({id:it.id,name:it.name,price:it.price,img:it.img,size:''}); } }
    if (rm){ var id=Number(rm.dataset.wrm); wish=wish.filter(function(i){return i.id!==id;}); saveWish(wish); syncWishUI(); renderWish(); }
  });

  if ($('searchBtn')) $('searchBtn').addEventListener('click', function(){
    var bar=$('searchBar'); if (bar){ bar.classList.toggle('open'); var inp=bar.querySelector('input'); if (inp && bar.classList.contains('open')) inp.focus(); }
  });

  if ($('sortSel')) $('sortSel').addEventListener('change', function(){
    var s=this; var url=new URL(window.location.href);
    if (s.value) url.searchParams.set('sort', s.value); else url.searchParams.delete('sort');
    window.location = url.toString();
  });

  if ($('newsBtn')) $('newsBtn').addEventListener('click', async function(){
    var email=val('newsEmail'), msg=$('newsMsg');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ if(msg){ msg.className='news-msg err'; msg.textContent='Enter a valid email.'; } return; }
    try { var r=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})}); var d=await r.json();
      if (d.ok){ if(msg){ msg.className='news-msg ok'; msg.textContent='Thanks — you\'re on the list!'; } if($('newsEmail')) $('newsEmail').value=''; }
      else { if(msg){ msg.className='news-msg err'; msg.textContent=d.error||'Could not subscribe.'; } }
    } catch(e){ if(msg){ msg.className='news-msg err'; msg.textContent='Could not subscribe.'; } }
  });

  if ($('rate')){
    var stars = $('rate').querySelectorAll('.star');
    function paint(v){ stars.forEach(function(s){ s.classList.toggle('on', Number(s.dataset.v) <= v); }); }
    stars.forEach(function(s){
      s.addEventListener('click', function(){ var v=Number(s.dataset.v); $('ratingInput').value=v; paint(v); });
      s.addEventListener('mouseenter', function(){ paint(Number(s.dataset.v)); });
    });
    $('rate').addEventListener('mouseleave', function(){ paint(Number($('ratingInput').value)); });
    paint(5);
  }

  // ---------------- THEME (light / dark) ----------------
  (function(){
    var root = document.documentElement;
    try { var saved = localStorage.getItem('axero_theme'); if (saved) root.setAttribute('data-theme', saved); } catch(e){}
    var tb = $('themeBtn');
    if (tb) tb.addEventListener('click', function(){
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      if (next === 'dark') root.removeAttribute('data-theme'); else root.setAttribute('data-theme','light');
      try { localStorage.setItem('axero_theme', next); } catch(e){}
    });
  })();

  syncBagBadge(); syncWishUI(); render();
})();
