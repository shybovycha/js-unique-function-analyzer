# Unique functions analyzer

## Overview

This tool lets you see how many _unique_ functions you have in your JS source code and which of them have most duplicates.

This comes useful when your modern JS application bundle consists of duplicates at `40%` or more, effectively wasting the client & server resources (on serving the duplicate bytes and parsing the same code on browser).

## Usage

### Analysis

Run `yarn analyze <your-input-js-file> --output <output-json-file>`.

This will analyze your source JS file and write the analysis results to the provided output file.

### Optimization

#### Automatic

Run `yarn optimize <your-input-js-file> --output <output-json-file> --threshold <occurrences>`.

This will analyze your source JS file, de-duplicate the function definitions with mode than `<occurrences>` duplicates and write the results to the provided output file.

#### Manual

First, analyze your bundle with `yarn analyze`.

Then, specify the list of function hashes you want to de-duplicate via `yarn optimize <your-input-js-file> --output <output-json-file> --hashes <comma-seprated-hashes>`.

This will analyze your source JS file and de-duplicate the function definitions specified in `<comma-separated-hashes>` argument and write the results to the provided output file.
