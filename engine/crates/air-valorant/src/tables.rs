//! Lookup tables ported from `esportra-valorant-hud/adapters/valorant-gep.js`.

/// Overwolf agent codename → display name.
pub fn agent(codename: &str) -> Option<&'static str> {
    Some(match codename {
        "Clay" => "RAZE",
        "Pandemic" => "VIPER",
        "Wraith" => "OMEN",
        "Hunter" => "SOVA",
        "Thorne" => "SAGE",
        "Phoenix" => "PHOENIX",
        "Wushu" => "JETT",
        "Gumshoe" => "CYPHER",
        "Sarge" => "BRIMSTONE",
        "Breach" => "BREACH",
        "Vampire" => "REYNA",
        "Killjoy" => "KILLJOY",
        "Guide" => "SKYE",
        "Stealth" => "YORU",
        "Rift" => "ASTRA",
        "Grenadier" => "KAY/O",
        "Deadeye" => "CHAMBER",
        "Sprinter" => "NEON",
        "BountyHunter" => "FADE",
        "Mage" => "HARBOR",
        "AggroBot" => "GEKKO",
        "Cable" => "DEADLOCK",
        "Sequoia" => "ISO",
        "Smonk" => "CLOVE",
        "Nox" => "VYSE",
        "Cashew" => "TEJO",
        "Terra" => "WAYLAY",
        "Iris" => "MIKS",
        "Pine" => "VETO",
        _ => return None,
    })
}

/// Overwolf map codename → display name.
pub fn map(codename: &str) -> Option<&'static str> {
    Some(match codename {
        "Infinity" => "ABYSS",
        "Triad" => "HAVEN",
        "Duality" => "BIND",
        "Bonsai" => "SPLIT",
        "Ascent" => "ASCENT",
        "Port" => "ICEBOX",
        "Foxtrot" => "BREEZE",
        "Canyon" => "FRACTURE",
        "Pitt" => "PEARL",
        "Jam" => "LOTUS",
        "Juliett" => "SUNSET",
        "Rook" => "CORRODE",
        "Summit" => "SUMMIT",
        _ => return None,
    })
}

/// Scoreboard loadout code → weapon.
pub fn loadout(code: &str) -> Option<&'static str> {
    Some(match code {
        "TX_Hud_Pistol_Classic" => "CLASSIC",
        "TX_Hud_Pistol_Slim" => "SHORTY",
        "TX_Hud_Pistol_AutoPistol" => "FRENZY",
        "TX_Hud_Pistol_Luger" => "GHOST",
        "TX_Hud_Pistol_Sheriff" => "SHERIFF",
        "TX_Hud_Shotguns_Pump" => "BUCKY",
        "TX_Hud_Shotguns_Persuader" => "JUDGE",
        "TX_Hud_SMGs_Vector" => "STINGER",
        "TX_Hud_SMGs_Ninja" => "SPECTRE",
        "TX_Hud_Rifles_Burst" => "BULLDOG",
        "TX_Hud_Rifles_DMR" => "GUARDIAN",
        "TX_Hud_Rifles_Ghost" => "PHANTOM",
        "TX_Hud_Rifles_Volcano" => "VANDAL",
        "TX_Hud_Sniper_Bolt" => "MARSHAL",
        "TX_Hud_Sniper_Operater" => "OPERATOR",
        "TX_Hud_Sniper_DoubleSniper" => "OUTLAW",
        "TX_Hud_LMG" => "ARES",
        "TX_Hud_HMG" => "ODIN",
        "knife" => "MELEE",
        "TX_Hud_Pistol_Bandit" => "BANDIT",
        "TX_Hud_Rifles_Warden" => "WARDEN",
        _ => return None,
    })
}

/// Kill-feed weapon or ability code (lower case) → display name.
pub fn kill_weapon(code: &str) -> Option<&'static str> {
    Some(match code {
        // short internal GEP kill_feed codes
        "tx_hud_pistol_glock_s" => "CLASSIC",
        "tx_hud_pistol_sawedoff_s" => "SHORTY",
        "tx_hud_autopistol" => "FRENZY",
        "tx_hud_pistol_luger_s" => "GHOST",
        "tx_hud_pistol_revolver_s" => "SHERIFF",
        "tx_hud_pump" => "BUCKY",
        "tx_hud_shotguns_spas12_s" => "JUDGE",
        "tx_hud_vector" => "STINGER",
        "tx_hud_smg_mp5_s" => "SPECTRE",
        "tx_hud_burst" => "BULLDOG",
        "tx_hud_dmr" => "GUARDIAN",
        "tx_hud_assault_ar10a2_s" => "PHANTOM",
        "tx_hud_volcano" => "VANDAL",
        "tx_hud_sniper_boltaction_s" => "MARSHAL",
        "tx_hud_operator" => "OPERATOR",
        "tx_hud_doublesniper" => "OUTLAW",
        "tx_hud_lmg" => "ARES",
        "tx_hud_hmg" => "ODIN",
        "tx_hud_knife_standard_s" => "MELEE",
        "knife" => "MELEE",
        // loadout-style aliases
        "tx_hud_pistol_classic" => "CLASSIC",
        "tx_hud_pistol_slim" => "SHORTY",
        "tx_hud_pistol_autopistol" => "FRENZY",
        "tx_hud_pistol_luger" => "GHOST",
        "tx_hud_pistol_sheriff" => "SHERIFF",
        "tx_hud_shotguns_pump" => "BUCKY",
        "tx_hud_shotguns_persuader" => "JUDGE",
        "tx_hud_smgs_vector" => "STINGER",
        "tx_hud_smgs_ninja" => "SPECTRE",
        "tx_hud_rifles_burst" => "BULLDOG",
        "tx_hud_rifles_dmr" => "GUARDIAN",
        "tx_hud_rifles_ghost" => "PHANTOM",
        "tx_hud_rifles_volcano" => "VANDAL",
        "tx_hud_sniper_bolt" => "MARSHAL",
        "tx_hud_sniper_operater" => "OPERATOR",
        "tx_hud_sniper_doublesniper" => "OUTLAW",
        "tx_hud_pistol_bandit" => "BANDIT",
        "tx_hud_rifles_warden" => "WARDEN",
        // abilities
        "tx_breach_fusionblast" => "AFTERSHOCK",
        "tx_sarge_molotovlauncher" => "INCENDIARY",
        "tx_sarge_orbitalstrike" => "ORBITAL STRIKE",
        "tx_pheonix_firewall" => "BLAZE",
        "tx_pheonix_molotov" => "HOT HANDS",
        "tx_hunter_shockarrow" => "SHOCK BOLT",
        "tx_hunter_bowblast" => "HUNTER'S FURY",
        "tx_hud_deadeye_q_pistol" => "HEADHUNTER",
        "tx_hud_deadeye_x_giantslayer" => "TOUR DE FORCE",
        "tx_cable_fishinghook" => "ANNIHILATION",
        "tx_hud_wushu_x_dagger" => "BLADE STORM",
        "tx_neon_ult" => "OVERDRIVE",
        "tx_gumshoe_tripwire" => "TRAPWIRE",
        "tx_gren_icon" => "FRAG/MENT",
        "tx_aggrobot_bubbles" => "MOSH PIT",
        "tx_kj_bees" => "NANOSWARM",
        "tx_kj_turret" => "TURRET",
        "tx_clay_boomba" => "BOOM BOT",
        "tx_clay_clusterbomb" => "PAINT SHELLS",
        "tx_clay_rocketlauncher" => "SHOWSTOPPER",
        "tx_guide4" => "TRAILBLAZER",
        "tx_pandemic_acidlauncher" => "SNAKE BITE",
        "tx_ui_cashew_e" => "GUIDED SALVO",
        "tx_ui_cashew_x" => "ARMAGEDDON",
        _ => return None,
    })
}

/// Scoreboard `shield` code → armour. Code 3 (enemy shield unknown) keeps the last value.
pub fn shield(code: &str) -> Option<i64> {
    Some(match code {
        "0" => 0,
        "1" => 25,
        "2" => 50,
        "4" => 25,
        _ => return None,
    })
}
