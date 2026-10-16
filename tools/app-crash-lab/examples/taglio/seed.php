<?php
require '/wordpress/wp-load.php';
update_option('tmsf_language', 'en');
update_option('default_editor', 'html');
$tags = [];
foreach (['WordPress', 'JavaScript', '日本語', 'press', 'unused'] as $name) {
    $value = term_exists($name, 'post_tag');
    if (!$value) $value = wp_insert_term($name, 'post_tag');
    if (is_wp_error($value)) throw new Exception($value->get_error_message());
    $tags[$name] = (int)$value['term_id'];
}
$id = wp_insert_post([
    'import_id' => 100,
    'post_title' => 'App Crash Lab synthetic tagging',
    'post_content' => 'WordPress and JavaScript. 日本語のブログです。',
    'post_status' => 'publish',
], true);
if (is_wp_error($id) || $id !== 100 || $tags !== ['WordPress'=>2, 'JavaScript'=>3, '日本語'=>4, 'press'=>5, 'unused'=>6]) {
    throw new Exception('Fresh synthetic post/tag identity differs; do not run the contract');
}
wp_set_post_tags($id, [], false);
file_put_contents('/wordpress/wp-content/aclf-fixture.json', json_encode(['post_id'=>$id, 'tags'=>$tags], JSON_UNESCAPED_UNICODE));
echo json_encode(['seeded_post'=>$id, 'tag_ids'=>$tags], JSON_UNESCAPED_UNICODE);
