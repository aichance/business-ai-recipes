<?php
require dirname(__DIR__) . '/wp-load.php';
header('Content-Type: application/json');
if (!defined('ACLF_TAGLIO_LOCAL_FIXTURE') || ACLF_TAGLIO_LOCAL_FIXTURE !== true) { http_response_code(403); echo '{"error":"Disposable local fixture only"}'; exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"error":"POST fixture reset only"}'; exit; }
$x=json_decode(file_get_contents('php://input'),true);
if (($x['fixture'] ?? '') !== 'aclf-taglio-v1') { http_response_code(400); echo '{"error":"Wrong synthetic fixture"}'; exit; }
$m=json_decode(file_get_contents(__DIR__.'/aclf-fixture.json'),true);
if (($m['post_id'] ?? null) !== 100) { http_response_code(409); echo '{"error":"Synthetic post identity differs"}'; exit; }
wp_update_post(['ID'=>$m['post_id'],'post_title'=>'App Crash Lab synthetic tagging','post_content'=>'WordPress and JavaScript. 日本語のブログです。','post_status'=>'publish']);
wp_set_post_tags($m['post_id'],[],false);
clean_post_cache($m['post_id']);
echo json_encode(['post_id'=>$m['post_id'],'tags'=>wp_get_post_tags($m['post_id'],['fields'=>'ids'])]);
