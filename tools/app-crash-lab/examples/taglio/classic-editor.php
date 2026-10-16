<?php
// Disposable local fixture only. Taglio's files are not modified.
define('ACLF_TAGLIO_LOCAL_FIXTURE', true);
add_filter('use_block_editor_for_post', '__return_false', 100);
add_filter('use_block_editor_for_post_type', '__return_false', 100);
