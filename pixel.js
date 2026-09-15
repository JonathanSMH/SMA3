/* Pixel da Meta (conjunto de dados "smaadvogados.com") com faixa informativa,
   nos mesmos moldes do samuelmosca.com.

   - O Pixel carrega por padrao (interesse legitimo para medicao de anuncio,
     LGPD art. 7, IX). "Recusar" revoga e a escolha fica no navegador.
   - Eventos: PageView ao abrir; ViewContent quando a secao de contato entra
     na tela; Lead no clique em WhatsApp, e-mail ou telefone e no envio do
     formulario (a pagina dispara "formulario-enviado" quando o Formspree
     responde ok). Cada Lead leva um eventID para deduplicar com a API de
     Conversoes, quando ela entrar.
   - Origem: utm_source / utm_campaign do link do anuncio ficam na sessao e
     entram na mensagem que abre no WhatsApp. */
(function () {
  var PIXEL_ID = '1104154028678334';
  var CHAVE = 'consentimento-cookies';
  var CHAVE_ORIGEM = 'origem-visita';
  var MENSAGEM = 'Olá. Vim pelo site da SMA e gostaria de conversar sobre uma operação.';
  var ASSUNTOS = { // utm_campaign -> "sobre ..."
    'leads-incorporadores': 'sobre incorporação e patrimônio de afetação'
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

    document.addEventListener('formulario-enviado', function () {
      if (window.fbq) window.fbq('track', 'Lead', { content_name: 'formulario' }, { eventID: idEvento('lead') });
    });

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
        dados = { fonte: fonte, campanha: url.searchParams.get('utm_campaign') || '' };
        sessionStorage.setItem(CHAVE_ORIGEM, JSON.stringify(dados));
      } else {
        var g = sessionStorage.getItem(CHAVE_ORIGEM);
        if (g) dados = JSON.parse(g);
      }
    } catch (e) { dados = null; }

    var abertura = MENSAGEM;
    if (dados) {
      var assunto = ASSUNTOS[dados.campanha];
      abertura = 'Olá. Vi o seu anúncio' + (assunto ? ' ' + assunto : '') + ' e gostaria de conversar sobre uma operação.';
    }
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me"]');
      if (!a) return;
      var u = new URL(a.href);
      if (!u.searchParams.get('text')) u.searchParams.set('text', abertura);
      a.href = u.toString();
    }, true);
  }

  /* ---------------- arranque ---------------- */
  function iniciar() {
    origem();
    var escolha = guardado(CHAVE);
    if (escolha === 'nao') return;
    carregarPixel();
    if (escolha !== 'sim') faixa();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
