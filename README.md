# Unique functions analyzer

## Overview

This tool lets you see how many _unique_ functions you have in your JS source code and which of them have most duplicates.

This comes useful when your modern JS application bundle consists of duplicates at `40%` or more, effectively wasting the client & server resources (on serving the duplicate bytes and parsing the same code on browser).

## Usage

Run `yarn analyze <your-input-js-file> <output-json-file>`.

This will analyze your source JS file and write the analysis results to the provided output file.
