export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      allergens: {
        Row: {
          code: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          name: string;
        };
        Update: {
          code?: string;
          name?: string;
        };
        Relationships: [];
      };
      attribute_definitions: {
        Row: {
          code: string;
          created_at: string;
          label: string;
          unit: string | null;
          value_type: Database["public"]["Enums"]["attribute_value_type"];
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          label: string;
          unit?: string | null;
          value_type: Database["public"]["Enums"]["attribute_value_type"];
        };
        Update: {
          code?: string;
          created_at?: string;
          label?: string;
          unit?: string | null;
          value_type?: Database["public"]["Enums"]["attribute_value_type"];
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor: string | null;
          at: string;
          diff: Json | null;
          entity: string;
          entity_id: string | null;
          id: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor?: string | null;
          at?: string;
          diff?: Json | null;
          entity: string;
          entity_id?: string | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor?: string | null;
          at?: string;
          diff?: Json | null;
          entity?: string;
          entity_id?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      brand_media: {
        Row: {
          asset_id: string;
          brand_id: string;
          is_primary: boolean;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          brand_id: string;
          is_primary?: boolean;
          position?: number;
        };
        Update: {
          asset_id?: string;
          brand_id?: string;
          is_primary?: boolean;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "brand_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brand_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "product_thumbnails";
            referencedColumns: ["asset_id"];
          },
          {
            foreignKeyName: "brand_media_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          created_at: string;
          id: string;
          manufacturer: string | null;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["record_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          manufacturer?: string | null;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["record_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          manufacturer?: string | null;
          name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["record_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          parent_id: string | null;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          parent_id?: string | null;
          slug: string;
        };
        Update: {
          id?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      category_media: {
        Row: {
          asset_id: string;
          category_id: string;
          is_primary: boolean;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          category_id: string;
          is_primary?: boolean;
          position?: number;
        };
        Update: {
          asset_id?: string;
          category_id?: string;
          is_primary?: boolean;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "category_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "product_thumbnails";
            referencedColumns: ["asset_id"];
          },
          {
            foreignKeyName: "category_media_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      cities: {
        Row: {
          active: boolean;
          country_code: string;
          created_at: string;
          ibge_code: string | null;
          id: string;
          name: string;
          region_id: string | null;
          uf: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          country_code?: string;
          created_at?: string;
          ibge_code?: string | null;
          id?: string;
          name: string;
          region_id?: string | null;
          uf?: string | null;
        };
        Update: {
          active?: boolean;
          country_code?: string;
          created_at?: string;
          ibge_code?: string | null;
          id?: string;
          name?: string;
          region_id?: string | null;
          uf?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cities_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "cities_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      contributions: {
        Row: {
          created_at: string;
          id: string;
          observation_id: string;
          points: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          observation_id: string;
          points: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          observation_id?: string;
          points?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contributions_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: true;
            referencedRelation: "current_prices";
            referencedColumns: ["observation_id"];
          },
          {
            foreignKeyName: "contributions_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: true;
            referencedRelation: "price_observations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contributions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      countries: {
        Row: {
          active: boolean;
          code: string;
          default_currency: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          default_currency: string;
          name: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          default_currency?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "countries_default_currency_fkey";
            columns: ["default_currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      currencies: {
        Row: {
          active: boolean;
          code: string;
          minor_unit: number;
          name: string;
          symbol: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          minor_unit: number;
          name: string;
          symbol?: string | null;
        };
        Update: {
          active?: boolean;
          code?: string;
          minor_unit?: number;
          name?: string;
          symbol?: string | null;
        };
        Relationships: [];
      };
      extractions: {
        Row: {
          confidence: number | null;
          created_at: string;
          id: string;
          model: string;
          raw_json: NonNullable<Json>;
          source_id: string;
        };
        ComputedFields: never;
        Insert: {
          confidence?: number | null;
          created_at?: string;
          id?: string;
          model: string;
          raw_json: NonNullable<Json>;
          source_id: string;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          id?: string;
          model?: string;
          raw_json?: NonNullable<Json>;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extractions_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      family_allergens: {
        Row: {
          allergen_code: string;
          family_id: string;
          presence: Database["public"]["Enums"]["allergen_presence"];
        };
        ComputedFields: never;
        Insert: {
          allergen_code: string;
          family_id: string;
          presence: Database["public"]["Enums"]["allergen_presence"];
        };
        Update: {
          allergen_code?: string;
          family_id?: string;
          presence?: Database["public"]["Enums"]["allergen_presence"];
        };
        Relationships: [
          {
            foreignKeyName: "family_allergens_allergen_code_fkey";
            columns: ["allergen_code"];
            isOneToOne: false;
            referencedRelation: "allergens";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "family_allergens_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "product_families";
            referencedColumns: ["id"];
          },
        ];
      };
      family_attribute_values: {
        Row: {
          attribute_code: string;
          family_id: string;
          value_boolean: boolean | null;
          value_number: number | null;
          value_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          attribute_code: string;
          family_id: string;
          value_boolean?: boolean | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Update: {
          attribute_code?: string;
          family_id?: string;
          value_boolean?: boolean | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "family_attribute_values_attribute_code_fkey";
            columns: ["attribute_code"];
            isOneToOne: false;
            referencedRelation: "attribute_definitions";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "family_attribute_values_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "product_families";
            referencedColumns: ["id"];
          },
        ];
      };
      family_nutrition: {
        Row: {
          basis: Database["public"]["Enums"]["nutrition_basis"];
          carbohydrate_g: number | null;
          energy_kcal: number | null;
          family_id: string;
          fat_g: number | null;
          fiber_g: number | null;
          protein_g: number | null;
          saturated_fat_g: number | null;
          serving_size: number | null;
          sodium_mg: number | null;
          sugars_g: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          basis: Database["public"]["Enums"]["nutrition_basis"];
          carbohydrate_g?: number | null;
          energy_kcal?: number | null;
          family_id: string;
          fat_g?: number | null;
          fiber_g?: number | null;
          protein_g?: number | null;
          saturated_fat_g?: number | null;
          serving_size?: number | null;
          sodium_mg?: number | null;
          sugars_g?: number | null;
          updated_at?: string;
        };
        Update: {
          basis?: Database["public"]["Enums"]["nutrition_basis"];
          carbohydrate_g?: number | null;
          energy_kcal?: number | null;
          family_id?: string;
          fat_g?: number | null;
          fiber_g?: number | null;
          protein_g?: number | null;
          saturated_fat_g?: number | null;
          serving_size?: number | null;
          sodium_mg?: number | null;
          sugars_g?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_nutrition_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: true;
            referencedRelation: "product_families";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory: {
        Row: {
          available: number | null;
          max_level: number | null;
          min_level: number | null;
          on_hand: number;
          product_id: string;
          reserved: number;
          updated_at: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          available?: never;
          max_level?: number | null;
          min_level?: number | null;
          on_hand?: number;
          product_id: string;
          reserved?: number;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          available?: never;
          max_level?: number | null;
          min_level?: number | null;
          on_hand?: number;
          product_id?: string;
          reserved?: number;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          cost_currency: string | null;
          created_at: string;
          created_by: string | null;
          id: number;
          idempotency_key: string | null;
          kind: Database["public"]["Enums"]["movement_kind"];
          note: string | null;
          on_hand_after: number;
          product_id: string;
          quantity_delta: number;
          reference: string | null;
          supplier_id: string | null;
          transfer_id: string | null;
          unit_cost_minor: number | null;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          cost_currency?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          idempotency_key?: string | null;
          kind: Database["public"]["Enums"]["movement_kind"];
          note?: string | null;
          on_hand_after: number;
          product_id: string;
          quantity_delta: number;
          reference?: string | null;
          supplier_id?: string | null;
          transfer_id?: string | null;
          unit_cost_minor?: number | null;
          warehouse_id: string;
        };
        Update: {
          cost_currency?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          idempotency_key?: string | null;
          kind?: Database["public"]["Enums"]["movement_kind"];
          note?: string | null;
          on_hand_after?: number;
          product_id?: string;
          quantity_delta?: number;
          reference?: string | null;
          supplier_id?: string | null;
          transfer_id?: string | null;
          unit_cost_minor?: number | null;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_cost_currency_fkey";
            columns: ["cost_currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_product_id_fkey";
            columns: ["warehouse_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "inventory";
            referencedColumns: ["warehouse_id", "product_id"];
          },
        ];
      };
      job_runs: {
        Row: {
          affected: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          job_name: string;
          run_key: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["job_run_status"];
        };
        ComputedFields: never;
        Insert: {
          affected?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          job_name: string;
          run_key?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["job_run_status"];
        };
        Update: {
          affected?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          job_name?: string;
          run_key?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["job_run_status"];
        };
        Relationships: [];
      };
      list_items: {
        Row: {
          checked: boolean;
          created_at: string;
          free_text: string | null;
          id: string;
          list_id: string;
          product_id: string | null;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          checked?: boolean;
          created_at?: string;
          free_text?: string | null;
          id?: string;
          list_id: string;
          product_id?: string | null;
          quantity?: number;
        };
        Update: {
          checked?: boolean;
          created_at?: string;
          free_text?: string | null;
          id?: string;
          list_id?: string;
          product_id?: string | null;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      markets: {
        Row: {
          code: string;
          country_code: string;
          created_at: string;
          currency_code: string;
          id: string;
          locale: string;
          name: string;
          prices_include_tax: boolean;
          region_id: string | null;
          status: Database["public"]["Enums"]["record_status"];
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          country_code: string;
          created_at?: string;
          currency_code: string;
          id?: string;
          locale?: string;
          name: string;
          prices_include_tax?: boolean;
          region_id?: string | null;
          status?: Database["public"]["Enums"]["record_status"];
          timezone: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          country_code?: string;
          created_at?: string;
          currency_code?: string;
          id?: string;
          locale?: string;
          name?: string;
          prices_include_tax?: boolean;
          region_id?: string | null;
          status?: Database["public"]["Enums"]["record_status"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "markets_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "markets_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "markets_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          alt_text: string | null;
          bucket: string;
          byte_size: number;
          created_at: string;
          created_by: string | null;
          error: string | null;
          height: number | null;
          id: string;
          mime_type: string;
          object_key: string;
          sha256: string;
          status: Database["public"]["Enums"]["media_status"];
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt_text?: string | null;
          bucket?: string;
          byte_size: number;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          height?: number | null;
          id?: string;
          mime_type: string;
          object_key: string;
          sha256: string;
          status?: Database["public"]["Enums"]["media_status"];
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          bucket?: string;
          byte_size?: number;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          height?: number | null;
          id?: string;
          mime_type?: string;
          object_key?: string;
          sha256?: string;
          status?: Database["public"]["Enums"]["media_status"];
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      media_renditions: {
        Row: {
          asset_id: string;
          byte_size: number;
          format: Database["public"]["Enums"]["media_format"];
          height: number;
          object_key: string;
          variant: Database["public"]["Enums"]["media_variant"];
          width: number;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          byte_size: number;
          format: Database["public"]["Enums"]["media_format"];
          height: number;
          object_key: string;
          variant: Database["public"]["Enums"]["media_variant"];
          width: number;
        };
        Update: {
          asset_id?: string;
          byte_size?: number;
          format?: Database["public"]["Enums"]["media_format"];
          height?: number;
          object_key?: string;
          variant?: Database["public"]["Enums"]["media_variant"];
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "media_renditions_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_renditions_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "product_thumbnails";
            referencedColumns: ["asset_id"];
          },
        ];
      };
      price_lists: {
        Row: {
          created_at: string;
          currency_code: string;
          id: string;
          market_id: string;
          name: string;
          priority: number;
          status: Database["public"]["Enums"]["record_status"];
          store_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          currency_code: string;
          id?: string;
          market_id: string;
          name: string;
          priority?: number;
          status?: Database["public"]["Enums"]["record_status"];
          store_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency_code?: string;
          id?: string;
          market_id?: string;
          name?: string;
          priority?: number;
          status?: Database["public"]["Enums"]["record_status"];
          store_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_lists_market_id_currency_code_fkey";
            columns: ["market_id", "currency_code"];
            isOneToOne: false;
            referencedRelation: "markets";
            referencedColumns: ["id", "currency_code"];
          },
          {
            foreignKeyName: "price_lists_store_id_market_id_fkey";
            columns: ["store_id", "market_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "market_id"];
          },
        ];
      };
      price_observations: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          confidence: number;
          created_at: string;
          created_by: string | null;
          id: string;
          observed_at: string;
          price_cents: number;
          product_id: string;
          promo: boolean;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source: Database["public"]["Enums"]["observation_source"];
          source_id: string | null;
          source_ref: string | null;
          status: Database["public"]["Enums"]["observation_status"];
          store_id: string;
          unit_price_cents: number;
          valid_from: string | null;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          confidence?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          observed_at?: string;
          price_cents: number;
          product_id: string;
          promo?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source: Database["public"]["Enums"]["observation_source"];
          source_id?: string | null;
          source_ref?: string | null;
          status?: Database["public"]["Enums"]["observation_status"];
          store_id: string;
          unit_price_cents: number;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          confidence?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          observed_at?: string;
          price_cents?: number;
          product_id?: string;
          promo?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source?: Database["public"]["Enums"]["observation_source"];
          source_id?: string | null;
          source_ref?: string | null;
          status?: Database["public"]["Enums"]["observation_status"];
          store_id?: string;
          unit_price_cents?: number;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "price_observations_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      product_aliases: {
        Row: {
          confidence: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          normalized_name: string;
          product_id: string | null;
          raw_name: string;
          status: Database["public"]["Enums"]["alias_status"];
          store_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          confidence?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          normalized_name: string;
          product_id?: string | null;
          raw_name: string;
          status?: Database["public"]["Enums"]["alias_status"];
          store_id?: string | null;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          normalized_name?: string;
          product_id?: string | null;
          raw_name?: string;
          status?: Database["public"]["Enums"]["alias_status"];
          store_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_aliases_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_aliases_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_aliases_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      product_families: {
        Row: {
          brand_id: string | null;
          category_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          ingredients: string | null;
          name: string;
          status: Database["public"]["Enums"]["record_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id?: string | null;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          ingredients?: string | null;
          name: string;
          status?: Database["public"]["Enums"]["record_status"];
          updated_at?: string;
        };
        Update: {
          brand_id?: string | null;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          ingredients?: string | null;
          name?: string;
          status?: Database["public"]["Enums"]["record_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_families_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_families_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      product_identifiers: {
        Row: {
          created_at: string;
          id: string;
          id_type: Database["public"]["Enums"]["identifier_type"];
          market_id: string | null;
          product_id: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          id_type: Database["public"]["Enums"]["identifier_type"];
          market_id?: string | null;
          product_id: string;
          value: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          id_type?: Database["public"]["Enums"]["identifier_type"];
          market_id?: string | null;
          product_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_identifiers_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "markets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_identifiers_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_media: {
        Row: {
          asset_id: string;
          is_primary: boolean;
          position: number;
          product_id: string;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          is_primary?: boolean;
          position?: number;
          product_id: string;
        };
        Update: {
          asset_id?: string;
          is_primary?: boolean;
          position?: number;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "product_thumbnails";
            referencedColumns: ["asset_id"];
          },
          {
            foreignKeyName: "product_media_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_prices: {
        Row: {
          amount_minor: number;
          created_at: string;
          created_by: string | null;
          id: string;
          price_list_id: string;
          product_id: string;
          valid_from: string;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          price_list_id: string;
          product_id: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          price_list_id?: string;
          product_id?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_prices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_prices_price_list_id_fkey";
            columns: ["price_list_id"];
            isOneToOne: false;
            referencedRelation: "price_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_prices_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          base_quantity: number | null;
          base_unit: Database["public"]["Enums"]["base_unit"] | null;
          brand: string | null;
          brand_id: string | null;
          canonical_name: string;
          category_id: string | null;
          created_at: string;
          family_id: string;
          gross_weight_g: number | null;
          gtin: string | null;
          height_mm: number | null;
          id: string;
          length_mm: number | null;
          pack_quantity: number;
          sale_mode: Database["public"]["Enums"]["sale_mode"];
          size_unit: Database["public"]["Enums"]["size_unit"];
          size_value: number;
          status: Database["public"]["Enums"]["record_status"];
          updated_at: string;
          variant_label: string | null;
          width_mm: number | null;
        };
        ComputedFields: never;
        Insert: {
          base_quantity?: never;
          base_unit?: never;
          brand?: string | null;
          brand_id?: string | null;
          canonical_name: string;
          category_id?: string | null;
          created_at?: string;
          family_id: string;
          gross_weight_g?: number | null;
          gtin?: string | null;
          height_mm?: number | null;
          id?: string;
          length_mm?: number | null;
          pack_quantity?: number;
          sale_mode?: Database["public"]["Enums"]["sale_mode"];
          size_unit: Database["public"]["Enums"]["size_unit"];
          size_value: number;
          status?: Database["public"]["Enums"]["record_status"];
          updated_at?: string;
          variant_label?: string | null;
          width_mm?: number | null;
        };
        Update: {
          base_quantity?: never;
          base_unit?: never;
          brand?: string | null;
          brand_id?: string | null;
          canonical_name?: string;
          category_id?: string | null;
          created_at?: string;
          family_id?: string;
          gross_weight_g?: number | null;
          gtin?: string | null;
          height_mm?: number | null;
          id?: string;
          length_mm?: number | null;
          pack_quantity?: number;
          sale_mode?: Database["public"]["Enums"]["sale_mode"];
          size_unit?: Database["public"]["Enums"]["size_unit"];
          size_value?: number;
          status?: Database["public"]["Enums"]["record_status"];
          updated_at?: string;
          variant_label?: string | null;
          width_mm?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "product_families";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          reputation: number;
          role: Database["public"]["Enums"]["user_role"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          reputation?: number;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          reputation?: number;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
      };
      promotion_products: {
        Row: {
          product_id: string;
          promotion_id: string;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          product_id: string;
          promotion_id: string;
          quantity?: number;
        };
        Update: {
          product_id?: string;
          promotion_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_products_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      promotion_rules: {
        Row: {
          amount_minor: number | null;
          brand_id: string | null;
          category_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["promotion_rule_kind"];
          promotion_id: string;
          quantity: number | null;
        };
        ComputedFields: never;
        Insert: {
          amount_minor?: number | null;
          brand_id?: string | null;
          category_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["promotion_rule_kind"];
          promotion_id: string;
          quantity?: number | null;
        };
        Update: {
          amount_minor?: number | null;
          brand_id?: string | null;
          category_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["promotion_rule_kind"];
          promotion_id?: string;
          quantity?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_rules_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_rules_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      promotion_scopes: {
        Row: {
          id: string;
          market_id: string;
          promotion_id: string;
          store_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          market_id: string;
          promotion_id: string;
          store_id?: string | null;
        };
        Update: {
          id?: string;
          market_id?: string;
          promotion_id?: string;
          store_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_scopes_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "markets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_scopes_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_scopes_store_id_market_id_fkey";
            columns: ["store_id", "market_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "market_id"];
          },
        ];
      };
      promotion_usage: {
        Row: {
          currency_code: string;
          discount_minor: number;
          id: string;
          order_ref: string;
          promotion_id: string;
          store_id: string;
          used_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          currency_code: string;
          discount_minor: number;
          id?: string;
          order_ref: string;
          promotion_id: string;
          store_id: string;
          used_at?: string;
          user_id?: string | null;
        };
        Update: {
          currency_code?: string;
          discount_minor?: number;
          id?: string;
          order_ref?: string;
          promotion_id?: string;
          store_id?: string;
          used_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_usage_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "promotion_usage_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_usage_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      promotions: {
        Row: {
          buy_quantity: number | null;
          created_at: string;
          created_by: string | null;
          currency_code: string | null;
          description: string | null;
          discount_amount_minor: number | null;
          discount_percent: number | null;
          ends_at: string | null;
          expired_at: string | null;
          fixed_price_minor: number | null;
          id: string;
          kind: Database["public"]["Enums"]["promotion_kind"];
          name: string;
          pay_quantity: number | null;
          priority: number;
          stackable: boolean;
          starts_at: string;
          status: Database["public"]["Enums"]["promotion_status"];
          updated_at: string;
          usage_count: number;
          usage_limit_per_customer: number | null;
          usage_limit_total: number | null;
        };
        ComputedFields: never;
        Insert: {
          buy_quantity?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          description?: string | null;
          discount_amount_minor?: number | null;
          discount_percent?: number | null;
          ends_at?: string | null;
          expired_at?: string | null;
          fixed_price_minor?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["promotion_kind"];
          name: string;
          pay_quantity?: number | null;
          priority?: number;
          stackable?: boolean;
          starts_at: string;
          status?: Database["public"]["Enums"]["promotion_status"];
          updated_at?: string;
          usage_count?: number;
          usage_limit_per_customer?: number | null;
          usage_limit_total?: number | null;
        };
        Update: {
          buy_quantity?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          description?: string | null;
          discount_amount_minor?: number | null;
          discount_percent?: number | null;
          ends_at?: string | null;
          expired_at?: string | null;
          fixed_price_minor?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["promotion_kind"];
          name?: string;
          pay_quantity?: number | null;
          priority?: number;
          stackable?: boolean;
          starts_at?: string;
          status?: Database["public"]["Enums"]["promotion_status"];
          updated_at?: string;
          usage_count?: number;
          usage_limit_per_customer?: number | null;
          usage_limit_total?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "promotions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotions_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      regions: {
        Row: {
          code: string;
          country_code: string;
          id: string;
          name: string;
          parent_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          country_code: string;
          id?: string;
          name: string;
          parent_id?: string | null;
        };
        Update: {
          code?: string;
          country_code?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "regions_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "regions_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      review_tasks: {
        Row: {
          assigned_to: string | null;
          created_at: string;
          id: string;
          payload: Json | null;
          reason: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["review_status"];
          target_id: string;
          target_type: Database["public"]["Enums"]["review_target"];
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          created_at?: string;
          id?: string;
          payload?: Json | null;
          reason: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          target_id: string;
          target_type: Database["public"]["Enums"]["review_target"];
        };
        Update: {
          assigned_to?: string | null;
          created_at?: string;
          id?: string;
          payload?: Json | null;
          reason?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          target_id?: string;
          target_type?: Database["public"]["Enums"]["review_target"];
        };
        Relationships: [
          {
            foreignKeyName: "review_tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_tasks_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_lists: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_lists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          created_at: string;
          error: string | null;
          file_path: string;
          id: string;
          kind: Database["public"]["Enums"]["source_kind"];
          period_end: string | null;
          period_start: string | null;
          sha256: string;
          status: Database["public"]["Enums"]["source_status"];
          store_id: string | null;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          error?: string | null;
          file_path: string;
          id?: string;
          kind: Database["public"]["Enums"]["source_kind"];
          period_end?: string | null;
          period_start?: string | null;
          sha256: string;
          status?: Database["public"]["Enums"]["source_status"];
          store_id?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          file_path?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["source_kind"];
          period_end?: string | null;
          period_start?: string | null;
          sha256?: string;
          status?: Database["public"]["Enums"]["source_status"];
          store_id?: string | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sources_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sources_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_reservations: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          product_id: string;
          quantity: number;
          reference: string;
          resolved_at: string | null;
          status: Database["public"]["Enums"]["reservation_status"];
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          product_id: string;
          quantity: number;
          reference: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["reservation_status"];
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          reference?: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["reservation_status"];
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_reservations_warehouse_id_product_id_fkey";
            columns: ["warehouse_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "inventory";
            referencedColumns: ["warehouse_id", "product_id"];
          },
        ];
      };
      stores: {
        Row: {
          address: string | null;
          city_id: string;
          cnpj: string | null;
          created_at: string;
          id: string;
          lat: number | null;
          lng: number | null;
          location: unknown;
          market_id: string;
          name: string;
          neighborhood: string | null;
          opening_hours: Json | null;
          status: Database["public"]["Enums"]["store_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          city_id: string;
          cnpj?: string | null;
          created_at?: string;
          id?: string;
          lat?: never;
          lng?: never;
          location: unknown;
          market_id: string;
          name: string;
          neighborhood?: string | null;
          opening_hours?: Json | null;
          status?: Database["public"]["Enums"]["store_status"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          city_id?: string;
          cnpj?: string | null;
          created_at?: string;
          id?: string;
          lat?: never;
          lng?: never;
          location?: unknown;
          market_id?: string;
          name?: string;
          neighborhood?: string | null;
          opening_hours?: Json | null;
          status?: Database["public"]["Enums"]["store_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stores_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stores_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "markets";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_products: {
        Row: {
          cost_minor: number;
          currency_code: string;
          is_preferred: boolean;
          lead_time_days: number | null;
          min_order_quantity: number;
          product_id: string;
          supplier_id: string;
          supplier_sku: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cost_minor: number;
          currency_code: string;
          is_preferred?: boolean;
          lead_time_days?: number | null;
          min_order_quantity?: number;
          product_id: string;
          supplier_id: string;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Update: {
          cost_minor?: number;
          currency_code?: string;
          is_preferred?: boolean;
          lead_time_days?: number | null;
          min_order_quantity?: number;
          product_id?: string;
          supplier_id?: string;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_products_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          country_code: string | null;
          created_at: string;
          email: string | null;
          id: string;
          legal_name: string | null;
          name: string;
          phone: string | null;
          status: Database["public"]["Enums"]["record_status"];
          tax_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          country_code?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          legal_name?: string | null;
          name: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["record_status"];
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          country_code?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          legal_name?: string | null;
          name?: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["record_status"];
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
      };
      warehouses: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["warehouse_kind"];
          market_id: string;
          name: string;
          status: Database["public"]["Enums"]["record_status"];
          store_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["warehouse_kind"];
          market_id: string;
          name: string;
          status?: Database["public"]["Enums"]["record_status"];
          store_id?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["warehouse_kind"];
          market_id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["record_status"];
          store_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "markets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouses_store_id_market_id_fkey";
            columns: ["store_id", "market_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "market_id"];
          },
        ];
      };
    };
    Views: {
      current_prices: {
        Row: {
          confidence: number;
          observation_id: string;
          observed_at: string;
          price_cents: number;
          product_id: string;
          promo: boolean;
          source: Database["public"]["Enums"]["observation_source"];
          store_id: string;
          unit_price_cents: number;
          valid_from: string | null;
          valid_to: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "price_observations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      price_board: {
        Row: {
          base_unit: Database["public"]["Enums"]["base_unit"] | null;
          brand: string | null;
          canonical_name: string;
          category_id: string | null;
          city_id: string;
          confidence: number;
          observed_at: string;
          price_cents: number;
          product_id: string;
          promo: boolean;
          size_unit: Database["public"]["Enums"]["size_unit"];
          size_value: number;
          store_id: string;
          store_name: string;
          store_neighborhood: string | null;
          unit_price_cents: number;
          valid_to: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "price_observations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stores_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      product_thumbnails: {
        Row: {
          alt_text: string | null;
          asset_id: string;
          product_id: string;
          thumb_height: number;
          thumb_key: string;
          thumb_width: number;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      apply_promotion_unit: {
        Args: {
          p_amount: number;
          p_fixed: number;
          p_kind: Database["public"]["Enums"]["promotion_kind"];
          p_percent: number;
          p_price: number;
        };
        Returns: number;
      };
      category_ancestry: { Args: { p_category_id: string }; Returns: string[] };
      commit_reservation: {
        Args: { p_reference?: string; p_reservation_id: string };
        Returns: number;
      };
      compare_list: { Args: { p_items: Json; p_lat?: number; p_lng?: number }; Returns: Json };
      expire_promotions: { Args: { p_now?: string }; Returns: number };
      expire_stock_reservations: { Args: { p_now?: string }; Returns: number };
      f_unaccent: { Args: { "": string }; Returns: string };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      job_run_finish: {
        Args: {
          p_affected?: number;
          p_error?: string;
          p_id: string;
          p_status: Database["public"]["Enums"]["job_run_status"];
        };
        Returns: undefined;
      };
      job_run_start: { Args: { p_job_name: string; p_run_key?: string }; Returns: string };
      list_live_promotions: {
        Args: { p_limit?: number; p_store_id: string };
        Returns: {
          currency_code: string;
          description: string;
          discount_amount_minor: number;
          discount_percent: number;
          ends_at: string;
          fixed_price_minor: number;
          id: string;
          kind: Database["public"]["Enums"]["promotion_kind"];
          name: string;
          product_ids: string[];
          starts_at: string;
        }[];
      };
      market_local_to_utc: { Args: { p_local: string; p_market_id: string }; Returns: string };
      money_round: { Args: { p_value: number }; Returns: number };
      price_history: {
        Args: { p_days?: number; p_product_id: string; p_store_id?: string };
        Returns: {
          observed_at: string;
          price_cents: number;
          promo: boolean;
          store_id: string;
          unit_price_cents: number;
        }[];
      };
      promotion_candidates: {
        Args: {
          p_at: string;
          p_market_id: string;
          p_product_id: string;
          p_quantity: number;
          p_store_id: string;
        };
        Returns: {
          discount_amount_minor: number;
          discount_percent: number;
          ends_at: string;
          fixed_price_minor: number;
          id: string;
          kind: Database["public"]["Enums"]["promotion_kind"];
          priority: number;
          stackable: boolean;
        }[];
      };
      promotion_conflicts: {
        Args: { p_promotion_id: string };
        Returns: {
          market_id: string;
          other_promotion_id: string;
          overlap: unknown;
          product_id: string;
        }[];
      };
      promotion_is_live: {
        Args: {
          p_at?: string;
          p_ends_at: string;
          p_starts_at: string;
          p_status: Database["public"]["Enums"]["promotion_status"];
        };
        Returns: boolean;
      };
      redeem_promotion: {
        Args: {
          p_at?: string;
          p_discount_minor: number;
          p_order_ref: string;
          p_promotion_id: string;
          p_store_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      refresh_current_prices: { Args: Record<PropertyKey, never>; Returns: undefined };
      release_reservation: { Args: { p_reservation_id: string }; Returns: boolean };
      reserve_stock: {
        Args: {
          p_product_id: string;
          p_quantity: number;
          p_reference: string;
          p_ttl?: string;
          p_warehouse_id: string;
        };
        Returns: string;
      };
      resolve_prices: {
        Args: { p_at?: string; p_product_ids: string[]; p_quantity?: number; p_store_id: string };
        Returns: {
          applied_promotion_ids: string[];
          currency_code: string;
          discount_minor: number;
          final_price_minor: number;
          list_price_minor: number;
          price_list_id: string;
          product_id: string;
          valid_until: string;
        }[];
      };
      search_products: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          base_unit: Database["public"]["Enums"]["base_unit"];
          brand: string;
          canonical_name: string;
          category_id: string;
          min_unit_price_cents: number;
          product_id: string;
          score: number;
          size_unit: Database["public"]["Enums"]["size_unit"];
          size_value: number;
          store_count: number;
        }[];
      };
      set_product_price: {
        Args: {
          p_amount_minor: number;
          p_effective_from?: string;
          p_price_list_id: string;
          p_product_id: string;
        };
        Returns: string;
      };
      slugify: { Args: { "": string }; Returns: string };
      stock_apply_movement: {
        Args: {
          p_cost_currency?: string;
          p_delta: number;
          p_idempotency_key?: string;
          p_kind: Database["public"]["Enums"]["movement_kind"];
          p_note?: string;
          p_product_id: string;
          p_reference?: string;
          p_supplier_id?: string;
          p_transfer_id?: string;
          p_unit_cost_minor?: number;
          p_warehouse_id: string;
        };
        Returns: number;
      };
      transfer_stock: {
        Args: {
          p_from_warehouse_id: string;
          p_product_id: string;
          p_quantity: number;
          p_reference?: string;
          p_to_warehouse_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      alias_status: "pending" | "approved" | "rejected";
      allergen_presence: "contains" | "may_contain";
      attribute_value_type: "text" | "number" | "boolean";
      base_unit: "kg" | "l" | "un";
      identifier_type: "gtin_alt" | "sku" | "internal_code" | "plu" | "mpn";
      job_run_status: "running" | "succeeded" | "failed";
      media_format: "webp" | "avif" | "jpeg";
      media_status: "pending" | "processing" | "ready" | "failed";
      media_variant: "thumb" | "small" | "medium" | "large";
      movement_kind:
        | "receipt"
        | "sale"
        | "return"
        | "adjustment"
        | "transfer_out"
        | "transfer_in"
        | "loss"
        | "damage";
      nutrition_basis: "per_100g" | "per_100ml";
      observation_source: "manual" | "flyer" | "label_photo" | "receipt" | "store_panel";
      observation_status: "pending" | "approved" | "rejected" | "superseded";
      promotion_kind: "percent_off" | "amount_off" | "fixed_price" | "bundle_price" | "buy_x_pay_y";
      promotion_rule_kind: "target_category" | "target_brand" | "min_quantity" | "min_spend";
      promotion_status: "draft" | "active" | "paused" | "expired" | "cancelled";
      record_status: "draft" | "active" | "archived";
      reservation_status: "active" | "committed" | "released" | "expired";
      review_status: "open" | "in_progress" | "resolved" | "dismissed";
      review_target: "price_observation" | "product_alias" | "source";
      sale_mode: "per_unit" | "by_weight" | "by_volume";
      size_unit: "g" | "kg" | "ml" | "l" | "un";
      source_kind: "flyer" | "label" | "receipt";
      source_status: "uploaded" | "processing" | "extracted" | "failed" | "reviewed";
      store_status: "pending" | "active" | "inactive";
      user_role: "user" | "contributor" | "admin";
      warehouse_kind: "distribution_center" | "store_stock";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      alias_status: ["pending", "approved", "rejected"],
      allergen_presence: ["contains", "may_contain"],
      attribute_value_type: ["text", "number", "boolean"],
      base_unit: ["kg", "l", "un"],
      identifier_type: ["gtin_alt", "sku", "internal_code", "plu", "mpn"],
      job_run_status: ["running", "succeeded", "failed"],
      media_format: ["webp", "avif", "jpeg"],
      media_status: ["pending", "processing", "ready", "failed"],
      media_variant: ["thumb", "small", "medium", "large"],
      movement_kind: [
        "receipt",
        "sale",
        "return",
        "adjustment",
        "transfer_out",
        "transfer_in",
        "loss",
        "damage",
      ],
      nutrition_basis: ["per_100g", "per_100ml"],
      observation_source: ["manual", "flyer", "label_photo", "receipt", "store_panel"],
      observation_status: ["pending", "approved", "rejected", "superseded"],
      promotion_kind: ["percent_off", "amount_off", "fixed_price", "bundle_price", "buy_x_pay_y"],
      promotion_rule_kind: ["target_category", "target_brand", "min_quantity", "min_spend"],
      promotion_status: ["draft", "active", "paused", "expired", "cancelled"],
      record_status: ["draft", "active", "archived"],
      reservation_status: ["active", "committed", "released", "expired"],
      review_status: ["open", "in_progress", "resolved", "dismissed"],
      review_target: ["price_observation", "product_alias", "source"],
      sale_mode: ["per_unit", "by_weight", "by_volume"],
      size_unit: ["g", "kg", "ml", "l", "un"],
      source_kind: ["flyer", "label", "receipt"],
      source_status: ["uploaded", "processing", "extracted", "failed", "reviewed"],
      store_status: ["pending", "active", "inactive"],
      user_role: ["user", "contributor", "admin"],
      warehouse_kind: ["distribution_center", "store_stock"],
    },
  },
} as const;
