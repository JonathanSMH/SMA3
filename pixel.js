/* Pixel da Meta (conjunto de dados "smaadvogados.com") com faixa informativa,
   nos mesmos moldes do samuelmosca.com.

   - O Pixel carrega por padrao (interesse legitimo para medicao de anuncio,
     LGPD art. 7, IX). "Recusar" revoga e a escolha fica no navegador.
   - Eventos: PageView ao abrir; ViewContent quando a secao de contato entra
     na tela; Lead no clique em WhatsApp (botao da secao de contato e os
     demais links wa.me), e-mail ou telefone. Nao ha mais formulario.
     Cada Lead leva um eventID para deduplicar com a API de Conversoes,
     quando ela entrar.
   - Origem: utm_source / utm_campaign do link do anuncio ficam na sessao e
     entram na mensagem que abre no WhatsApp. */
(function () {
  var PIXEL_ID = '1104154028678334';
  var CHAVE = 'consentimento-cookies';
  var CHAVE_ORIGEM = 'origem-visita';
  var MENSAGEM = 'Olá. Vim pelo site da SMA e quero falar com um advogado.';
  var ASSUNTOS = { // utm_campaign -> "sobre ..."
    'leads-incorporadores': 'sobre proteção de investimentos imobiliários'
  };

  function guardado(chave, valor) {
    try {
      if (arguments.length > 1) { localStorage.setItem(chave, valor); return valor; }
      return localStorage.getItem(chave);
    } catch (e) { return null; }
  }

  /* ---------------- Pixel ---------------- */
  function carregarPixel() {
    if (window.fbq) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    ligarEventos();
  }

  function idEvento(prefixo) {
    return prefixo + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function ligarEventos() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me"], a[href^="mailto:"], a[href^="tel:"]');
      if (!a || !window.fbq) return;
      var href = a.getAttribute('href') || '';
      var canal = href.indexOf('wa.me') >= 0 ? 'whatsapp' : href.indexOf('mailto:') === 0 ? 'email' : 'telefone';
      window.fbq('track', 'Lead', { content_name: canal }, { eventID: idEvento('lead') });
    }, true);

    var contato = document.getElementById('contato');
    if (contato && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        if (!ents.some(function (x) { return x.isIntersecting; })) return;
        io.disconnect();
        if (window.fbq) window.fbq('track', 'ViewContent', { content_name: 'contato' });
      }, { threshold: 0.3 });
      io.observe(contato);
    }
  }

  /* ---------------- Faixa ---------------- */
  function faixa() {
    var el = document.createElement('div');
    el.className = 'cookies';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Cookies');
    el.innerHTML =
      '<p>Este site usa cookies de medição para entender como a página é usada e medir os anúncios que trazem visitas. Você pode recusar.</p>' +
      '<div class="cookies-acoes"><button type="button" class="cookies-recusar">Recusar</button><button type="button" class="cookies-ok">Entendi</button></div>';
    el.querySelector('.cookies-recusar').addEventListener('click', function () {
      guardado(CHAVE, 'nao');
      if (window.fbq) window.fbq('consent', 'revoke');
      el.remove();
    });
    el.querySelector('.cookies-ok').addEventListener('click', function () {
      guardado(CHAVE, 'sim');
      el.remove();
    });
    document.body.appendChild(el);
  }

  /* ---------------- Origem ---------------- */
  function origem() {
    var dados = null;
    try {
      var url = new URL(window.location.href);
      var fonte = url.searchParams.get('utm_source');
      if (fonte) {
        dados = { fonte: fonte, campanha: url.searchParams.get('utm_campaign') || '', conteudo: url.searchParams.get('utm_content') || '' };
        sessionStorage.setItem(CHAVE_ORIGEM, JSON.stringify(dados));
      } else {
        var g = sessionStorage.getItem(CHAVE_ORIGEM);
        if (g) dados = JSON.parse(g);
      }
    } catch (e) { dados = null; }

    var abertura = MENSAGEM;
    if (dados) {
      var assunto = ASSUNTOS[dados.campanha];
      abertura = 'Olá. Vi o seu anúncio' + (assunto ? ' ' + assunto : ' da SMA') + ' e quero falar com um advogado.';
    }
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me"]');
      if (!a) return;
      var u = new URL(a.href);
      var texto = u.searchParams.get('text') || abertura;
      var codigo = gerarCodigo();
      u.searchParams.set('text', texto + ' #' + codigo);
      a.href = u.toString();
      gravarRastro(codigo, dados, a);
    }, true);
  }

  /* ---------------- Rastro da conversa ----------------
     O codigo de quatro letras no fim da mensagem ("#k7m2") e gravado com o
     fbp/fbc do Pixel na tabela conversas_origem (projeto smhpatrimonial; a
     chave publicavel so insere). Quando a mensagem chega no WhatsApp, o
     webhook casa o codigo e manda o evento Contact para a Meta com a
     identidade certa: a conversa real passa a contar no Gerenciador. */
  var SUPABASE_URL = 'https://ixqsetvplcvtocsqqlfb.supabase.co';
  var SUPABASE_CHAVE = 'sb_publishable_51S32vDenDLCelzUvjwkGQ_4_8mV4Sd';
  var ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
  function gerarCodigo() {
    var n = new Uint8Array(4);
    crypto.getRandomValues(n);
    var c = '';
    for (var i = 0; i < 4; i++) c += ALFABETO[n[i] % ALFABETO.length];
    return c;
  }
  function cookie(nome) {
    var partes = document.cookie.split('; ');
    for (var i = 0; i < partes.length; i++) {
      if (partes[i].indexOf(nome + '=') === 0) return partes[i].slice(nome.length + 1);
    }
    return null;
  }
  function gravarRastro(codigo, dados, a) {
    var secao = a.closest && a.closest('section');
    var linha = {
      codigo: codigo,
      site: 'smaadvogados',
      fbp: cookie('_fbp'),
      fbc: cookie('_fbc'),
      utm_source: dados ? dados.fonte : null,
      utm_campaign: dados ? dados.campanha : null,
      utm_content: dados ? (dados.conteudo || null) : null,
      pagina: window.location.pathname + window.location.hash,
      botao: (secao && secao.id) || 'outro',
      agente: navigator.userAgent.slice(0, 256)
    };
    try {
      fetch(SUPABASE_URL + '/rest/v1/conversas_origem', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_CHAVE,
          Authorization: 'Bearer ' + SUPABASE_CHAVE,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(linha)
      }).catch(function () {});
    } catch (err) {}
  }

  /* ---------------- WhatsApp pelo app ----------------
     No celular, o wa.me aberto de dentro do Instagram passa por uma tela
     intermediaria que no iPhone muitas vezes nao abre o aplicativo (em
     15-20/09, 2 toques e nenhuma mensagem). O esquema whatsapp:// abre o app
     direto; se em 1,5 s a pagina continuar visivel, cai no wa.me como antes.
     Corre na borbulha, depois da reescrita do texto e sem parar a propagacao,
     para o Pixel continuar contando o Lead. */
  function abrirNoApp() {
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me/"]');
      if (!a) return;
      var destino;
      try { destino = new URL(a.href); } catch (err) { return; }
      var telefone = destino.pathname.replace(/\D/g, '');
      if (!telefone) return;
      e.preventDefault();
      var texto = destino.searchParams.get('text') || '';
      var esquema = 'whatsapp://send?phone=' + telefone + (texto ? '&text=' + encodeURIComponent(texto) : '');
      var reserva = destino.toString();
      var inicio = Date.now();
      var temporizador = setTimeout(function () {
        if (document.visibilityState === 'hidden' || Date.now() - inicio > 2500) return;
        window.location.href = reserva;
      }, 1500);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') clearTimeout(temporizador);
      }, { once: true });
      window.location.href = esquema;
    });
  }

  /* ---------------- arranque ---------------- */
  function iniciar() {
    origem();
    abrirNoApp();
    var escolha = guardado(CHAVE);
    if (escolha === 'nao') return;
    carregarPixel();
    if (escolha !== 'sim') faixa();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
