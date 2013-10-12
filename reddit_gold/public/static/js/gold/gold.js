r.gold = {
    init: function() {
        $('section#about-gold-partners').on('click', 'input.code', function() {
            $(this).select()
        })
    },

    claim_gold_partner_deal_code: function (elem, name, redirect_url) {
        $.ajax({
                  type: 'POST',
                  dataType: 'json',
                  url: '/api/claim_gold_partner_deal_code.json',
                  data:  {'deal': name, 'uh': r.config.modhash},
                  success: function(data) {
                      if ('error' in data) {
                          var $newelem = $('<span class="error">').text(data['explanation'])
                          $(elem).replaceWith($newelem)
                      } else {
                          if (redirect_url) {
                              window.location.href = redirect_url.replace('{{code}}', data['code'])
                          } else {
                              var $newelem = $('<input type="text" class="code" readonly="readonly">').attr('value', data['code'])
                              $(elem).replaceWith($newelem)
                              $newelem.select()
                          }
                      }
                  }
                })
    }
}
