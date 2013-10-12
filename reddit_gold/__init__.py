from r2.lib.js import Module
from r2.lib.plugin import Plugin

class Gold(Plugin):
    needs_static_build = True

    js = {
        'gold': Module('gold.js',
            'gold.js',
            prefix='gold/',
        )
    }

    def add_routes(self, mc):
        mc('/gold/about', controller='gold', action='about')
        mc('/gold/partners', controller='gold', action='partners')
        mc('/api/claim_gold_partner_deal_code', controller='goldapi', action='claim_gold_partner_deal_code')

    def load_controllers(self):
        from reddit_gold.controllers import GoldController, GoldApiController
