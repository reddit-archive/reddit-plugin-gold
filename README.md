# reddit gold plugin

This plugin adds the /gold/about page.

## installation

First, install the python package:

    python ./setup.py develop

To enable the plugin, you will need to add it to the plugins line of your
reddit .ini file:

    plugins = gold
    
Finally, configure the plugin in your reddit .ini file:

    wiki_page_gold_features = goldfeatures
    wiki_page_gold_partners = goldpartners
    gold_hostname_file = goldhostname

To build static files for production, run `make` in the main reddit repository.
It will detect, build, and merge in the gold plugin static files for
deployment.
