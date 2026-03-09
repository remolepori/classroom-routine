<?php
/**
 * Plugin Name: Classroom Routine Board
 * Description: Visuelles Tages-Board mit Icons, Texten, pro-Benutzer-Speicherung, Plus-Button und Speichern/Laden-Menü unten rechts.
 * Version: 1.0.3
 * Author: Remo Lepori
 */

if (!defined('ABSPATH')) exit;

class Classroom_Routine_Board {
  const VERSION            = '1.0.3';
  const META_STATE         = '_cr_board_state';
  const META_PRESETS       = '_cr_board_presets';      // name => state (assoc)
  const META_PRESET_ORDER  = '_cr_board_preset_order'; // [name, name, ...]

  public function __construct() {
    add_shortcode('classroom_routine', [$this, 'shortcode']);
    add_action('wp_enqueue_scripts', [$this, 'assets']);
    add_action('rest_api_init',      [$this, 'register_rest']);
  }

  public function assets() {
    if (!is_singular()) return;

    wp_enqueue_style('cr-board', plugins_url('assets/board.css', __FILE__), [], self::VERSION);
    wp_enqueue_script('cr-board', plugins_url('assets/board.js', __FILE__), ['jquery'], self::VERSION, true);
    wp_enqueue_media();

    $user_id = get_current_user_id();

    wp_localize_script('cr-board', 'CR_DATA', [
      'rest'         => esc_url_raw( rest_url('cr/v1/') ),
      'nonce'        => wp_create_nonce('wp_rest'),
      'isAuth'       => is_user_logged_in(),
      'userId'       => $user_id,
      'defaults'     => self::default_state(),
      'emojiJsonUrl' => plugins_url('assets/emoji-full.json', __FILE__),
    ]);
  }

  public function shortcode($atts = []) {
    ob_start(); ?>

    <div id="cr-app" class="cr-app" data-section="morning">
      <div class="cr-header">
        <h1 class="cr-title" data-edit="section-title" aria-label="Boardtitel">Guten Morgen! <span class="cr-emoji">😊</span></h1>
      </div>

      <div id="cr-list" class="cr-list" aria-live="polite"></div>

      <div class="cr-bottom-bar">
        <div class="cr-controls-left">
          <button class="cr-reset-font" title="Alle Schriftgrössen zurücksetzen"><i class="fa-solid fa-rotate-right"></i></button>
          <label><input type="range" id="cr-size-title"   min="20" max="100" value="56" /> Titel</label>
          <label><input type="range" id="cr-size-heading" min="14" max="60"  value="32" /> Überschrift</label>
          <label><input type="range" id="cr-size-text"    min="12" max="40"  value="22" /> Text</label>
          <label><input type="range" id="cr-size-icon"    min="24" max="120" value="56" /> Emoji</label>
        </div>

        <div class="cr-controls-right">
          <button class="cr-action" data-action="save-now" title="Speichern"><i class="fa-solid fa-floppy-disk"></i></button>
          <button class="cr-action" data-action="save"      title="Speichern unter"><i class="fa-solid fa-copy"></i></button>
          <button class="cr-action" data-action="load"      title="Laden"><i class="fa-solid fa-folder-open"></i></button>
          <button class="cr-action" data-action="reset"     title="Zurücksetzen"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
      </div>

      <div class="cr-fab-wrap">
        <button class="cr-fab" aria-haspopup="true" aria-expanded="false" title="Ansicht & Presets">⋮</button>
        <div class="cr-fab-menu" hidden>
          <button class="cr-fab-item" data-action="save">Ansicht speichern</button>
          <button class="cr-fab-item" data-action="load">Ansicht laden</button>
          <button class="cr-fab-item" data-action="reset">Zurücksetzen</button>
        </div>
      </div>

      <dialog id="cr-save-dialog" class="cr-dialog">
        <form method="dialog" class="cr-dialog-inner">
          <h3>Routine speichern</h3>
          <label>Name der Routine
            <input type="text" id="cr-preset-name" placeholder="z. B. Ablauf Montag" required />
          </label>
          <div class="cr-dialog-actions">
            <button value="cancel" class="cr-btn ghost">Abbrechen</button>
            <button value="ok" class="cr-btn primary">Speichern</button>
          </div>
        </form>
      </dialog>

      <dialog id="cr-load-dialog" class="cr-dialog">
        <form method="dialog" class="cr-dialog-inner">
          <div class="cr-dialog-wrapper">
	     <h3 class="cr-dialog-header">Routine öffnen</h3>
             <div class="cr-dialog-actions">
                <button value="close" class="cr-btn"><i class="fas fa-window-close"></i></button>
             </div>
	  </div>
          <div id="cr-preset-list" class="cr-preset-list" role="list"></div>
        </form>
      </dialog>
    </div>
    <?php
    return ob_get_clean();
  }

  /** Standardzustand */
  public static function default_state() {
    return [
      'sections' => [
        'morning' => [
          'title' => 'Guten Morgen! 😊',
          'items' => [
            ['icon'=>'','emoji'=>'📥','title'=>'Abgeben','desc'=>'Wenn du Hausaufgaben oder Prüfungen zum Unterschreiben hattest, dann lege diese in das Drop-Off Fach.'],
            ['emoji'=>'🗓️','title'=>'Tageskarten wechseln','desc'=>'Wenn du das Kind der Woche bist, dann wechsle die Tageskarten.'],
            ['emoji'=>'📚','title'=>'Platz einrichten','desc'=>'Nimm alle Materialien, die du heute brauchst, zu deinem Pult.'],
            ['emoji'=>'📝','title'=>'Platz für Prüfung einrichten','desc'=>'Richte deinen Arbeitsplatz für die Prüfung ein: Sichtschutz und leeres Pult.'],
            ['emoji'=>'📖','title'=>'Lesebuch','desc'=>'Nimm dein Lesebuch (am Freitag auch ein Buch aus der Klassenbibliothek erlaubt) und setze dich an deinen Platz.'],
            ['emoji'=>'🤫','title'=>'Leise lesen','desc'=>'Lies leise für dich an deinem Platz, bis die Lehrperson gongt.','canAddAfter'=>true],
          ],
        ],
        'exam' => [
          'title' => 'Vor Prüfung',
          'items' => [
            ['emoji'=>'📖','title'=>'Lesebuch','desc'=>'Nimm dein Lesebuch und setze dich an deinen Platz.'],
            ['emoji'=>'🤫','title'=>'Leise lesen','desc'=>'Lies leise für dich, bis Herr Lepori gongt.','canAddAfter'=>true],
          ],
        ],
        'day' => [
          'title' => 'Während dem Tag',
          'items' => [
            ['emoji'=>'🧹','title'=>'Ämtchen','desc'=>'Erledige dein Ämtchen, wenn du dran bist.'],
            ['emoji'=>'🤝','title'=>'Helfen','desc'=>'Wenn du fertig bist, hilf anderen Kindern.','canAddAfter'=>true],
          ],
        ],
        'end' => [
          'title' => 'Tschüss! 👋',
          'items' => [
            ['emoji'=>'📚','title'=>'Material versorgen','desc'=>'Versorge deine Materialien in deinem Fach oder der Schublade.'],
            ['emoji'=>'🧹','title'=>'Ämtchen','desc'=>'Erledige dein Ämtchen.'],
            ['emoji'=>'🤝','title'=>'Helfen','desc'=>'Wenn du dein Ämtchen erledigt hast, hilfst du anderen Kindern.'],
            ['emoji'=>'🪑','title'=>'Stuhl hoch','desc'=>'Mittwoch und Freitag: Stell deinen Stuhl hoch.'],
            ['emoji'=>'🧍‍♂️','title'=>'Hinter Pult stehen','desc'=>'Stehe hinter deinen Pult, wenn du mit allem fertig bist.','canAddAfter'=>true],
          ],
        ],
      ],
    ];
  }

  /** REST API */
  public function register_rest() {

    // ---------- STATE LESEN ----------
    register_rest_route('cr/v1', '/state', [
      'methods'  => 'GET',
      'callback' => function(WP_REST_Request $req) {
        $user_id = get_current_user_id();
        if (!$user_id) {
          return new WP_REST_Response(['state' => self::default_state()], 200);
        }
        $state = get_user_meta($user_id, self::META_STATE, true);
        if (!$state) $state = self::default_state();
        return new WP_REST_Response(['state' => $state], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- STATE SPEICHERN ----------
    register_rest_route('cr/v1', '/state', [
      'methods'  => 'POST',
      'callback' => function(WP_REST_Request $req) {
        if (!wp_verify_nonce($req->get_header('X-WP-Nonce'), 'wp_rest')) {
          return new WP_Error('forbidden', 'Bad nonce', ['status'=>403]);
        }
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_Error('forbidden', 'Login erforderlich', ['status'=>401]);

        $state = $req->get_param('state');
        if (!is_array($state)) return new WP_Error('invalid', 'Ungültige Daten', ['status'=>422]);

        update_user_meta($user_id, self::META_STATE, $state);
        return new WP_REST_Response(['ok'=>true], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- PRESET SPEICHERN / LÖSCHEN (POST-Fallback) ----------
    register_rest_route('cr/v1', '/preset', [
      'methods'  => 'POST',
      'callback' => function(WP_REST_Request $req) {
        if (!wp_verify_nonce($req->get_header('X-WP-Nonce'), 'wp_rest')) {
          return new WP_Error('forbidden','Bad nonce',['status'=>403]);
        }
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_Error('forbidden','Login erforderlich',['status'=>401]);

        $name   = sanitize_text_field( $req->get_param('name') );
        $delete = (bool) $req->get_param('delete');
        $action = sanitize_text_field( $req->get_param('action') );
        $state  = $req->get_param('state');

        $presets = get_user_meta($user_id, self::META_PRESETS, true);
        if (!is_array($presets)) $presets = [];

        // DELETE via POST
        if ($delete || $action === 'delete') {
          if (!$name || !array_key_exists($name, $presets)) {
            return new WP_Error('not_found','Preset nicht gefunden',['status'=>404]);
          }
          unset($presets[$name]);

          // Aus Order entfernen
          $order = get_user_meta($user_id, self::META_PRESET_ORDER, true);
          if (!is_array($order)) $order = [];
          $order = array_values(array_filter($order, fn($n)=> $n !== $name));
          update_user_meta($user_id, self::META_PRESET_ORDER, $order);

          update_user_meta($user_id, self::META_PRESETS, $presets);
          return new WP_REST_Response(['deleted'=>true], 200);
        }

        // NORMAL SAVE / CREATE-OR-UPDATE
        if (!$name || !is_array($state)) {
          return new WP_Error('invalid','Ungültige Daten',['status'=>422]);
        }
        $is_new = !array_key_exists($name, $presets);
        $presets[$name] = $state;
        update_user_meta($user_id, self::META_PRESETS, $presets);

        if ($is_new) {
          $order = get_user_meta($user_id, self::META_PRESET_ORDER, true);
          if (!is_array($order)) $order = [];
          if (!in_array($name, $order, true)) {
            $order[] = $name; // neue Presets ans Ende
            update_user_meta($user_id, self::META_PRESET_ORDER, $order);
          }
        }

        return new WP_REST_Response(['ok'=>true], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- PRESETS AUFLISTEN (inkl. ORDER) ----------
    register_rest_route('cr/v1', '/presets', [
      'methods'  => 'GET',
      'callback' => function(WP_REST_Request $req) {
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_REST_Response(['presets'=>[], 'order'=>[]], 200);

        $presets = get_user_meta($user_id, self::META_PRESETS, true);
        if (!is_array($presets)) $presets = [];

        $order = get_user_meta($user_id, self::META_PRESET_ORDER, true);
        if (!is_array($order)) $order = [];

        // Order bereinigen: nur existierende, fehlende hinten anhängen
        $names = array_keys($presets);
        $order = array_values(array_filter($order, fn($n)=> array_key_exists($n, $presets)));
        foreach ($names as $n) {
          if (!in_array($n, $order, true)) $order[] = $n;
        }

        // Persistente Bereinigung
        update_user_meta($user_id, self::META_PRESET_ORDER, $order);

        return new WP_REST_Response(['presets'=>$presets, 'order'=>$order], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- PRESET LADEN ----------
    register_rest_route('cr/v1', '/load', [
      'methods'  => 'POST',
      'callback' => function(WP_REST_Request $req) {
        if (!wp_verify_nonce($req->get_header('X-WP-Nonce'), 'wp_rest')) {
          return new WP_Error('forbidden','Bad nonce',['status'=>403]);
        }
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_Error('forbidden','Login erforderlich',['status'=>401]);

        $name = sanitize_text_field( $req->get_param('name') );
        $presets = get_user_meta($user_id, self::META_PRESETS, true);
        if (!is_array($presets) || empty($presets[$name])) {
          return new WP_Error('not_found','Preset nicht gefunden',['status'=>404]);
        }

        update_user_meta($user_id, self::META_STATE, $presets[$name]);
        return new WP_REST_Response(['state'=>$presets[$name]], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- PRESET LÖSCHEN per DELETE ?name= ----------
    register_rest_route('cr/v1', '/preset', [
      'methods'  => 'DELETE',
      'callback' => function(WP_REST_Request $req) {
        if (!wp_verify_nonce($req->get_header('X-WP-Nonce'), 'wp_rest')) {
          return new WP_Error('forbidden','Bad nonce',['status'=>403]);
        }
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_Error('forbidden','Login erforderlich',['status'=>401]);

        $name = sanitize_text_field( $req->get_param('name') );
        if (!$name) return new WP_Error('invalid','Name fehlt',['status'=>422]);

        $presets = get_user_meta($user_id, self::META_PRESETS, true);
        if (!is_array($presets) || !array_key_exists($name, $presets)) {
          return new WP_Error('not_found','Preset nicht gefunden',['status'=>404]);
        }
        unset($presets[$name]);
        update_user_meta($user_id, self::META_PRESETS, $presets);

        $order = get_user_meta($user_id, self::META_PRESET_ORDER, true);
        if (!is_array($order)) $order = [];
        $order = array_values(array_filter($order, fn($n)=> $n !== $name));
        update_user_meta($user_id, self::META_PRESET_ORDER, $order);

        return new WP_REST_Response(['deleted'=>true], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- PRESET LÖSCHEN per DELETE /preset/<name> ----------
    register_rest_route('cr/v1', '/preset/(?P<name>[^/]+)', [
      'methods'  => 'DELETE',
      'callback' => function(WP_REST_Request $req) {
        if (!wp_verify_nonce($req->get_header('X-WP-Nonce'), 'wp_rest')) {
          return new WP_Error('forbidden','Bad nonce',['status'=>403]);
        }
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_Error('forbidden','Login erforderlich',['status'=>401]);

        $name = sanitize_text_field( $req['name'] ?? '' );
        if (!$name) return new WP_Error('invalid','Name fehlt',['status'=>422]);

        $presets = get_user_meta($user_id, self::META_PRESETS, true);
        if (!is_array($presets) || !array_key_exists($name, $presets)) {
          return new WP_Error('not_found','Preset nicht gefunden',['status'=>404]);
        }
        unset($presets[$name]);
        update_user_meta($user_id, self::META_PRESETS, $presets);

        $order = get_user_meta($user_id, self::META_PRESET_ORDER, true);
        if (!is_array($order)) $order = [];
        $order = array_values(array_filter($order, fn($n)=> $n !== $name));
        update_user_meta($user_id, self::META_PRESET_ORDER, $order);

        return new WP_REST_Response(['deleted'=>true], 200);
      },
      'permission_callback' => '__return_true',
    ]);

    // ---------- PRESET-ORDER SPEICHERN ----------
    register_rest_route('cr/v1', '/preset-order', [
      'methods'  => 'POST',
      'callback' => function(WP_REST_Request $req) {
        if (!wp_verify_nonce($req->get_header('X-WP-Nonce'), 'wp_rest')) {
          return new WP_Error('forbidden','Bad nonce',['status'=>403]);
        }
        $user_id = get_current_user_id();
        if (!$user_id) return new WP_Error('forbidden','Login erforderlich',['status'=>401]);

        $order = $req->get_param('order');
        if (!is_array($order)) return new WP_Error('invalid','Ungültige Reihenfolge',['status'=>422]);

        $presets = get_user_meta($user_id, self::META_PRESETS, true);
        if (!is_array($presets)) $presets = [];

        // Nur Namen übernehmen, die existieren
        $filtered = array_values(array_filter($order, fn($n)=> is_string($n) && array_key_exists($n, $presets)));

        // Fehlende Presets anhängen
        foreach (array_keys($presets) as $n) {
          if (!in_array($n, $filtered, true)) $filtered[] = $n;
        }

        update_user_meta($user_id, self::META_PRESET_ORDER, $filtered);
        return new WP_REST_Response(['ok'=>true, 'order'=>$filtered], 200);
      },
      'permission_callback' => '__return_true',
    ]);
  }
}

new Classroom_Routine_Board();
