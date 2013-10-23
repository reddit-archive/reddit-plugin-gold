import ConfigParser
import os
import platform
import sys
import time

from kazoo.protocol.states import KazooState
from kazoo.recipe.lock import Lock, Semaphore

from r2.lib.zookeeper import connect_to_zookeeper


ROOT = "/gold/server-names"
LOCK = "/gold/server-names-semaphore"


def state_listener(state):
    # just bail if we've lost our session; upstart will revive us.
    assert state != KazooState.LOST


def acquire_name(client, hostname_path):
    potential_names = client.get_children(ROOT)
    hostname = platform.node()

    semaphore = Semaphore(
        client=client,
        path=LOCK,
        identifier=hostname,
        max_leases=len(potential_names),
    )

    print "waiting for name semaphore"
    with semaphore:
        # OK, we're one of the chosen servers. let's find a name that no one is
        # using.

        print "name semaphore acquired. finding name."
        while True:
            potential_names = client.get_children(ROOT)

            for name in potential_names:
                name_lock = Lock(client, os.path.join(ROOT, name), hostname)
                if name_lock.acquire(blocking=False):
                    with open(hostname_path, "w") as hostname_file:
                        print >> hostname_file, name

                    # just sit around doing nothing for ever
                    print "name %r acquired. sleeping." % name
                    while True:
                        time.sleep(1)
            else:
                # failed to lock anything. likely waiting for a session to
                # expire. just pause for a little while.
                print "failed to find a name. will try again."
                time.sleep(1)


def main():
    parser = ConfigParser.RawConfigParser()
    with open(sys.argv[1]) as config_file:
        parser.readfp(config_file)

    hostname_path = parser.get("DEFAULT", "gold_hostname_file")
    zk_connection_string = parser.get("DEFAULT", "zookeeper_connection_string")
    zk_username = parser.get("DEFAULT", "zookeeper_username")
    zk_password = parser.get("DEFAULT", "zookeeper_password")

    client = connect_to_zookeeper(zk_connection_string,
                                  (zk_username, zk_password))
    client.add_listener(state_listener)

    acl = [client.make_acl(read=True, write=True, create=True, delete=True)]
    client.ensure_path(ROOT, acl=acl)
    client.ensure_path(LOCK, acl=acl)

    try:
        acquire_name(client, hostname_path)
    finally:
        try:
            os.unlink(hostname_path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
