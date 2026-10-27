# Accept "1h30m"-style timeouts

Job timeouts are raw millisecond numbers in the config and people keep
getting them wrong (someone set a two-day timeout as 172800). Let's accept
human-readable durations like `1h30m`, `90s` or `250ms` and convert them
to milliseconds. Would also be nice to print them back in the same style in
the admin UI instead of the raw number.
