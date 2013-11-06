import ConfigParser
import logging
import os
import platform
import sys
import time

import kazoo.exceptions

from kazoo.protocol.states import KazooState
from kazoo.recipe.lock import Lock, Semaphore

from r2.lib.zookeeper import connect_to_zookeeper


# make kazoo's error log print out to the console etc.
logging.basicConfig()


ROOT = "/gold/server-names"
LOCK = "/gold/server-names-semaphore"


def state_listener(state):
    # just bail if we've lost our session; upstart will revive us.
    if state == KazooState.LOST:
        os._exit(0)


def bail_if_slots_change(children):
    # if the number of slots change, we should bail out and let restart
    # take care of things.
    os._exit(0)


def acquire_name(client, hostname_path):
    name_slots = client.get_children(ROOT, watch=bail_if_slots_change)
    hostname = platform.node()

    semaphore = Semaphore(
        client=client,
        path=LOCK,
        identifier=hostname,
        max_leases=len(name_slots),
    )

    # waiting on the semaphore indefinitely seems to cause things to hang up
    # sometimes. instead, we'll cause ourselves to time out and retry if things
    # are taking a while.
    while True:
        print "waiting for name semaphore"
        try:
            semaphore.acquire(timeout=60)
        except kazoo.exceptions.LockTimeout:
            continue
        else:
            break

    try:
        # OK, we're one of the chosen servers. let's find a name that no one is
        # using.
        print "name semaphore acquired. finding name."
        while True:
            name_slots = client.get_children(ROOT)

            for slot in name_slots:
                slot_path = os.path.join(ROOT, slot)
                slot_lock = Lock(client, slot_path, hostname)
                if slot_lock.acquire(blocking=False):
                    @client.DataWatch(slot_path)
                    def on_name_change(name, stat):
                        print "got name %r." % name
                        with open(hostname_path, "w") as hostname_file:
                            print >> hostname_file, name

                    # just sit around doing nothing for ever
                    try:
                        while True:
                            time.sleep(1)
                    finally:
                        # explicitly releasing the lock decreases delay until
                        # someone else can get this slot.
                        slot_lock.release()
            else:
                # failed to lock anything. likely waiting for a session to
                # expire. just pause for a little while.
                print "failed to find a name. will try again."
                time.sleep(1)
    finally:
        semaphore.release()


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
