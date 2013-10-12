# reddit gold plugin

This plugin adds the /gold/about and /gold/partners pages.

## installation

First, install the python package:

    python ./setup.py develop

To enable the plugin, you will need to add it to the plugins line of your
reddit .ini file:

    plugins = gold

To build static files for production, run `make` in the main reddit repository.
It will detect, build, and merge in the gold plugin static files for
deployment.
