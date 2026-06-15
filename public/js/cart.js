// cart.js — bag (browser storage) + shipping + Razorpay checkout (UPI/PhonePe/GPay/cards)
(function () {
  var KEY = 'axero_cart';
  var fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  var money = function (paise) { return fmt.format((paise || 0) / 100); };

  function load(){ try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(c){ localStorage.setItem(KEY, JSON.stringify(c)); }
  var cart = load();
  var stage = 'cart'; // 'cart' -> 'ship'

  function count(){ return cart.reduce(function(n,i){return n+i.qty;},0); }
  function total(){ return cart.reduce(function(n,i){return n+i.qty*i.price;},0); }

  function syncBadge(){
    var b = document.getElementById('bagCount');
    var n = count(); b.textContent = n; b.classList.toggle('show', n > 0);
  }

  function addItem(p){
    var ex = cart.find(function(i){ return i.id===p.id && i.size===p.size; });
    if (ex) ex.qty += 1; else cart.push(Object.assign({}, p, { qty: 1 }));
    save(cart); syncBadge(); setStage('cart'); render(); openDrawer();
  }
  function changeQty(idx,d){ cart[idx].qty += d; if (cart[idx].qty<=0) cart.splice(idx,1); save(cart); syncBadge(); render(); }
  function removeItem(idx){ cart.splice(idx,1); save(cart); syncBadge(); render(); }

  function render(){
    var wrap = document.getElementById('cartItems');
    var foot = document.getElementById('cartFoot');
    var ship = document.getElementById('shipStep');
    var proceed = document.getElementById('proceedBtn');
    var pay = document.getElementById('payBtn');
    if (!cart.length){
      wrap.innerHTML = '<div class="empty-cart">Your bag is empty.<br>Add something you love.</div>';
      foot.style.display = 'none'; ship.style.display = 'none'; return;
    }
    wrap.innerHTML = cart.map(function(i,idx){
      return '<div class="citem"><div class="thumb">'+(i.img?'<img src="'+i.img+'" alt="">':'')+'</div>'
        + '<div style="flex:1"><p class="cname">'+i.name+'</p>'
        + '<small>Size '+i.size+' &middot; '+money(i.price)+'</small>'
        + '<div class="qty"><button data-q="'+idx+'" data-d="-1" aria-label="Decrease">&minus;</button>'
        + '<span>'+i.qty+'</span><button data-q="'+idx+'" data-d="1" aria-label="Increase">+</button>'
        + '<button class="rm" data-rm="'+idx+'">Remove</button></div></div></div>';
    }).join('');
    document.getElementById('cartTotal').textContent = money(total());
    foot.style.display = 'block';
    if (stage === 'ship'){ ship.style.display='block'; proceed.style.display='none'; pay.style.display='block'; }
    else { ship.style.display='none'; proceed.style.display='block'; pay.style.display='none'; }
  }

  function setStage(s){ stage = s; document.getElementById('drawerTitle').textContent = (s==='ship'?'Checkout':'Your bag'); }

  // drawer
  var drawer = document.getElementById('drawer');
  var scrim = document.getElementById('scrim');
  function openDrawer(){ drawer.classList.add('open'); scrim.classList.add('open'); }
  function closeDrawer(){ drawer.classList.remove('open'); scrim.classList.remove('open'); }
  document.getElementById('bagBtn').addEventListener('click', openDrawer);
  document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  document.querySelectorAll('.add').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sel = document.getElementById(btn.dataset.sizeSelect);
      addItem({ id:Number(btn.dataset.id), name:btn.dataset.name, price:Number(btn.dataset.price),
        img:btn.dataset.img||'', size: sel?sel.value:'' });
    });
  });

  document.getElementById('cartItems').addEventListener('click', function(e){
    var q = e.target.closest('[data-q]'); var rm = e.target.closest('[data-rm]');
    if (q) changeQty(Number(q.dataset.q), Number(q.dataset.d));
    if (rm) removeItem(Number(rm.dataset.rm));
  });

  // step 1: show shipping form
  document.getElementById('proceedBtn').addEventListener('click', function(){
    if (!window.AXERO_PAY_READY){ alert('Payments are not switched on yet. Add your Razorpay keys to accept orders.'); return; }
    setStage('ship'); render();
    document.getElementById('cartItems').scrollIntoView({ behavior:'smooth', block:'start' });
  });

  function shipping(){
    return {
      name: val('s_name'), phone: val('s_phone'), email: val('s_email'),
      address: val('s_address'), city: val('s_city'), pincode: val('s_pincode')
    };
  }
  function val(id){ return (document.getElementById(id).value || '').trim(); }

  // step 2: pay
  document.getElementById('payBtn').addEventListener('click', async function(){
    var s = shipping(); var err = document.getElementById('shipErr');
    if (!s.name || !s.phone || !s.address || !s.pincode){ err.textContent='Please fill name, phone, address and PIN code.'; return; }
    if (!/^[0-9]{10}$/.test(s.phone)){ err.textContent='Enter a valid 10-digit phone number.'; return; }
    if (!/^[0-9]{6}$/.test(s.pincode)){ err.textContent='Enter a valid 6-digit PIN code.'; return; }
    err.textContent = '';
    var btn = this; btn.disabled = true; btn.textContent = 'Starting payment…';

    try {
      var res = await fetch('/api/checkout', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ cart: cart.map(function(i){return {id:i.id,qty:i.qty,size:i.size};}), shipping: s })
      });
      var data = await res.json();
      if (!data.orderId){ alert(data.error||'Could not start checkout.'); reset(btn); return; }

      var rzp = new Razorpay({
        key: data.keyId, amount: data.amount, currency: data.currency,
        name: data.name, description: 'Axero order', order_id: data.orderId,
        prefill: data.prefill, theme: { color: '#7A2E4A' },
        handler: async function(response){
          var v = await fetch('/api/verify', {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(response)
          });
          var out = await v.json();
          if (out.redirect){ localStorage.removeItem(KEY); window.location = out.redirect; }
          else { alert(out.error || 'Payment could not be verified.'); reset(btn); }
        },
        modal: { ondismiss: function(){ reset(btn); } }
      });
      rzp.on('payment.failed', function(){ alert('Payment failed. Please try again.'); reset(btn); });
      rzp.open();
    } catch (e){ alert('Something went wrong. Please try again.'); reset(btn); }
  });

  function reset(btn){ btn.disabled = false; btn.textContent = 'Pay securely'; }

  syncBadge(); render();
})();
