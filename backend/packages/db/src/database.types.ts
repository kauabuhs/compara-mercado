
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"at": string,"diff": Json | null,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"at"?: string,"diff"?: Json | null,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"at"?: string,"diff"?: Json | null,"entity"?: string,"entity_id"?: string | null,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "id": string,"name": string,"parent_id": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"parent_id"?: string | null,"slug": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"parent_id"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"cities": {
                  Row: {
                    "active": boolean,"created_at": string,"ibge_code": string,"id": string,"name": string,"uf": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"ibge_code": string,"id"?: string,"name": string,"uf": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"ibge_code"?: string,"id"?: string,"name"?: string,"uf"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contributions": {
                  Row: {
                    "created_at": string,"id": string,"observation_id": string,"points": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"observation_id": string,"points": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"observation_id"?: string,"points"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contributions_observation_id_fkey"
      columns: ["observation_id"]
isOneToOne: true
      referencedRelation: "current_prices"
      referencedColumns: ["observation_id"]
    },{
      foreignKeyName: "contributions_observation_id_fkey"
      columns: ["observation_id"]
isOneToOne: true
      referencedRelation: "price_observations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contributions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"extractions": {
                  Row: {
                    "confidence": number | null,"created_at": string,"id": string,"model": string,"raw_json": NonNullable<Json>,"source_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: number | null,"created_at"?: string,"id"?: string,"model": string,"raw_json": NonNullable<Json>,"source_id": string
                  }
                  Update: {
                    "confidence"?: number | null,"created_at"?: string,"id"?: string,"model"?: string,"raw_json"?: NonNullable<Json>,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "extractions_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"list_items": {
                  Row: {
                    "checked": boolean,"created_at": string,"free_text": string | null,"id": string,"list_id": string,"product_id": string | null,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "checked"?: boolean,"created_at"?: string,"free_text"?: string | null,"id"?: string,"list_id": string,"product_id"?: string | null,"quantity"?: number
                  }
                  Update: {
                    "checked"?: boolean,"created_at"?: string,"free_text"?: string | null,"id"?: string,"list_id"?: string,"product_id"?: string | null,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_items_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "shopping_lists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "list_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"price_observations": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"confidence": number,"created_at": string,"created_by": string | null,"id": string,"observed_at": string,"price_cents": number,"product_id": string,"promo": boolean,"source": Database["public"]['Enums']["observation_source"],"source_id": string | null,"source_ref": string | null,"status": Database["public"]['Enums']["observation_status"],"store_id": string,"unit_price_cents": number,"valid_from": string | null,"valid_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"confidence"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"observed_at"?: string,"price_cents": number,"product_id": string,"promo"?: boolean,"source": Database["public"]['Enums']["observation_source"],"source_id"?: string | null,"source_ref"?: string | null,"status"?: Database["public"]['Enums']["observation_status"],"store_id": string,"unit_price_cents": number,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"confidence"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"observed_at"?: string,"price_cents"?: number,"product_id"?: string,"promo"?: boolean,"source"?: Database["public"]['Enums']["observation_source"],"source_id"?: string | null,"source_ref"?: string | null,"status"?: Database["public"]['Enums']["observation_status"],"store_id"?: string,"unit_price_cents"?: number,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_observations_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_observations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_observations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_observations_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_observations_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"product_aliases": {
                  Row: {
                    "confidence": number | null,"created_at": string,"created_by": string | null,"id": string,"normalized_name": string,"product_id": string | null,"raw_name": string,"status": Database["public"]['Enums']["alias_status"],"store_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"normalized_name": string,"product_id"?: string | null,"raw_name": string,"status"?: Database["public"]['Enums']["alias_status"],"store_id"?: string | null
                  }
                  Update: {
                    "confidence"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"normalized_name"?: string,"product_id"?: string | null,"raw_name"?: string,"status"?: Database["public"]['Enums']["alias_status"],"store_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_aliases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_aliases_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_aliases_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "base_quantity": number | null,"base_unit": Database["public"]['Enums']["base_unit"] | null,"brand": string | null,"canonical_name": string,"category_id": string | null,"created_at": string,"gtin": string | null,"id": string,"size_unit": Database["public"]['Enums']["size_unit"],"size_value": number,"status": Database["public"]['Enums']["record_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_quantity"?: never,"base_unit"?: never,"brand"?: string | null,"canonical_name": string,"category_id"?: string | null,"created_at"?: string,"gtin"?: string | null,"id"?: string,"size_unit": Database["public"]['Enums']["size_unit"],"size_value": number,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Update: {
                    "base_quantity"?: never,"base_unit"?: never,"brand"?: string | null,"canonical_name"?: string,"category_id"?: string | null,"created_at"?: string,"gtin"?: string | null,"id"?: string,"size_unit"?: Database["public"]['Enums']["size_unit"],"size_value"?: number,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"reputation": number,"role": Database["public"]['Enums']["user_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"reputation"?: number,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"reputation"?: number,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                },"review_tasks": {
                  Row: {
                    "assigned_to": string | null,"created_at": string,"id": string,"payload": Json | null,"reason": string,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["review_status"],"target_id": string,"target_type": Database["public"]['Enums']["review_target"]
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"created_at"?: string,"id"?: string,"payload"?: Json | null,"reason": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["review_status"],"target_id": string,"target_type": Database["public"]['Enums']["review_target"]
                  }
                  Update: {
                    "assigned_to"?: string | null,"created_at"?: string,"id"?: string,"payload"?: Json | null,"reason"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["review_status"],"target_id"?: string,"target_type"?: Database["public"]['Enums']["review_target"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_tasks_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_tasks_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_lists": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_lists_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "created_at": string,"error": string | null,"file_path": string,"id": string,"kind": Database["public"]['Enums']["source_kind"],"period_end": string | null,"period_start": string | null,"sha256": string,"status": Database["public"]['Enums']["source_status"],"store_id": string | null,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"file_path": string,"id"?: string,"kind": Database["public"]['Enums']["source_kind"],"period_end"?: string | null,"period_start"?: string | null,"sha256": string,"status"?: Database["public"]['Enums']["source_status"],"store_id"?: string | null,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"file_path"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["source_kind"],"period_end"?: string | null,"period_start"?: string | null,"sha256"?: string,"status"?: Database["public"]['Enums']["source_status"],"store_id"?: string | null,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sources_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sources_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stores": {
                  Row: {
                    "address": string | null,"city_id": string,"cnpj": string | null,"created_at": string,"id": string,"lat": number | null,"lng": number | null,"location": unknown,"name": string,"neighborhood": string | null,"opening_hours": Json | null,"status": Database["public"]['Enums']["store_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"city_id": string,"cnpj"?: string | null,"created_at"?: string,"id"?: string,"lat"?: never,"lng"?: never,"location": unknown,"name": string,"neighborhood"?: string | null,"opening_hours"?: Json | null,"status"?: Database["public"]['Enums']["store_status"],"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"city_id"?: string,"cnpj"?: string | null,"created_at"?: string,"id"?: string,"lat"?: never,"lng"?: never,"location"?: unknown,"name"?: string,"neighborhood"?: string | null,"opening_hours"?: Json | null,"status"?: Database["public"]['Enums']["store_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stores_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "current_prices": {
                  Row: {
                    "confidence": number,"observation_id": string,"observed_at": string,"price_cents": number,"product_id": string,"promo": boolean,"source": Database["public"]['Enums']["observation_source"],"store_id": string,"unit_price_cents": number,"valid_from": string | null,"valid_to": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "price_observations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_observations_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"price_board": {
                  Row: {
                    "base_unit": Database["public"]['Enums']["base_unit"] | null,"brand": string | null,"canonical_name": string,"category_id": string | null,"city_id": string,"confidence": number,"observed_at": string,"price_cents": number,"product_id": string,"promo": boolean,"size_unit": Database["public"]['Enums']["size_unit"],"size_value": number,"store_id": string,"store_name": string,"store_neighborhood": string | null,"unit_price_cents": number,"valid_to": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "price_observations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_observations_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stores_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"compare_list":
{ Args: { "p_items": Json,"p_lat"?: number,"p_lng"?: number }; Returns: Json
                           },
"f_unaccent":
{ Args: { "": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"price_history":
{ Args: { "p_days"?: number,"p_product_id": string,"p_store_id"?: string }; Returns: {
              "observed_at": string,"price_cents": number,"promo": boolean,"store_id": string,"unit_price_cents": number
            }[]
                           },
"refresh_current_prices":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"search_products":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "base_unit": Database["public"]['Enums']["base_unit"],"brand": string,"canonical_name": string,"category_id": string,"min_unit_price_cents": number,"product_id": string,"score": number,"size_unit": Database["public"]['Enums']["size_unit"],"size_value": number,"store_count": number
            }[]
                           }
          }
          Enums: {
            "alias_status": "pending"|"approved"|"rejected","base_unit": "kg"|"l"|"un","observation_source": "manual"|"flyer"|"label_photo"|"receipt"|"store_panel","observation_status": "pending"|"approved"|"rejected"|"superseded","record_status": "active"|"archived","review_status": "open"|"in_progress"|"resolved"|"dismissed","review_target": "price_observation"|"product_alias"|"source","size_unit": "g"|"kg"|"ml"|"l"|"un","source_kind": "flyer"|"label"|"receipt","source_status": "uploaded"|"processing"|"extracted"|"failed"|"reviewed","store_status": "pending"|"active"|"inactive","user_role": "user"|"contributor"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "alias_status": ["pending", "approved", "rejected"],"base_unit": ["kg", "l", "un"],"observation_source": ["manual", "flyer", "label_photo", "receipt", "store_panel"],"observation_status": ["pending", "approved", "rejected", "superseded"],"record_status": ["active", "archived"],"review_status": ["open", "in_progress", "resolved", "dismissed"],"review_target": ["price_observation", "product_alias", "source"],"size_unit": ["g", "kg", "ml", "l", "un"],"source_kind": ["flyer", "label", "receipt"],"source_status": ["uploaded", "processing", "extracted", "failed", "reviewed"],"store_status": ["pending", "active", "inactive"],"user_role": ["user", "contributor", "admin"]
          }
        }
} as const
