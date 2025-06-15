#!/bin/bash
osascript -e "tell application \"Terminal\" to do script \"$1\"" -e "tell application \"Terminal\" to set custom title of front window to \"$2\""
