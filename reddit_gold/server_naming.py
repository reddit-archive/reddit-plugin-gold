from pylons import g, c

from r2.lib.hooks import HookRegistrar


hooks = HookRegistrar()


@hooks.on("reddit.request.begin")
def add_gold_hostname():
    c.gold_hostname = ""

    if g.gold_hostname_file:
        try:
            with open(g.gold_hostname_file) as f:
                c.gold_hostname = f.read().strip()
        except IOError:
            pass
