#!/usr/bin/env python
from setuptools import setup, find_packages

setup(name='reddit_gold',
    description='reddit gold',
    version='0.1',
    author='Chad Birch',
    author_email='chad@reddit.com',
    packages=find_packages(),
    install_requires=[
        'r2',
    ],
    entry_points={
        'r2.plugin':
            ['gold = reddit_gold:Gold']
    },
    include_package_data=True,
    zip_safe=False,
)
