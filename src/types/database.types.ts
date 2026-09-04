export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assessment_assignments: {
        Row: {
          assessment_id: string
          assigned_by: string
          classroom_id: string | null
          created_at: string
          due_at: string | null
          id: string
          student_id: string | null
        }
        Insert: {
          assessment_id: string
          assigned_by: string
          classroom_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          student_id?: string | null
        }
        Update: {
          assessment_id?: string
          assigned_by?: string
          classroom_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_assignments_assessment_id_fkey'
            columns: ['assessment_id']
            isOneToOne: false
            referencedRelation: 'assessments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_assignments_assigned_by_fkey'
            columns: ['assigned_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_assignments_classroom_id_fkey'
            columns: ['classroom_id']
            isOneToOne: false
            referencedRelation: 'classrooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_assignments_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_attempts: {
        Row: {
          assessment_id: string
          completed_at: string | null
          correct_count: number
          current_question_index: number
          id: string
          pending_manual_count: number
          score_percent: number
          started_at: string
          student_id: string
          total_questions: number
        }
        Insert: {
          assessment_id: string
          completed_at?: string | null
          correct_count?: number
          current_question_index?: number
          id?: string
          pending_manual_count?: number
          score_percent?: number
          started_at?: string
          student_id: string
          total_questions?: number
        }
        Update: {
          assessment_id?: string
          completed_at?: string | null
          correct_count?: number
          current_question_index?: number
          id?: string
          pending_manual_count?: number
          score_percent?: number
          started_at?: string
          student_id?: string
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_attempts_assessment_id_fkey'
            columns: ['assessment_id']
            isOneToOne: false
            referencedRelation: 'assessments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_attempts_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_bank_question_tags: {
        Row: {
          assessment_bank_question_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          assessment_bank_question_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          assessment_bank_question_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'bank_question_tags_bank_question_id_fkey'
            columns: ['assessment_bank_question_id']
            isOneToOne: false
            referencedRelation: 'assessment_bank_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bank_question_tags_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_bank_questions: {
        Row: {
          created_at: string
          created_by: string
          difficulty: Database['public']['Enums']['question_difficulty']
          id: string
          payload: Json
          points: number
          sub_topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          difficulty: Database['public']['Enums']['question_difficulty']
          id?: string
          payload: Json
          points?: number
          sub_topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          difficulty?: Database['public']['Enums']['question_difficulty']
          id?: string
          payload?: Json
          points?: number
          sub_topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_bank_questions_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bank_questions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          payload: Json
          points: number
          position: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          payload: Json
          points?: number
          position: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          payload?: Json
          points?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_questions_assessment_id_fkey'
            columns: ['assessment_id']
            isOneToOne: false
            referencedRelation: 'assessments'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_template_questions: {
        Row: {
          bank_question_id: string
          position: number
          template_id: string
        }
        Insert: {
          bank_question_id: string
          position: number
          template_id: string
        }
        Update: {
          bank_question_id?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_template_questions_bank_question_id_fkey'
            columns: ['bank_question_id']
            isOneToOne: false
            referencedRelation: 'assessment_bank_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_template_questions_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'assessment_templates'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          grade_level_id: string
          id: string
          shuffle_questions: boolean
          status: Database['public']['Enums']['assessment_status']
          subject_id: string
          time_limit_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          grade_level_id: string
          id?: string
          shuffle_questions?: boolean
          status?: Database['public']['Enums']['assessment_status']
          subject_id: string
          time_limit_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          grade_level_id?: string
          id?: string
          shuffle_questions?: boolean
          status?: Database['public']['Enums']['assessment_status']
          subject_id?: string
          time_limit_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_templates_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_templates_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_templates_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      assessments: {
        Row: {
          answers_released_at: string | null
          answers_released_by: string | null
          classroom_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          organization_id: string
          show_auto_score_while_pending: boolean
          shuffle_questions: boolean
          status: Database['public']['Enums']['assessment_status']
          time_limit_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          answers_released_at?: string | null
          answers_released_by?: string | null
          classroom_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          organization_id: string
          show_auto_score_while_pending?: boolean
          shuffle_questions?: boolean
          status?: Database['public']['Enums']['assessment_status']
          time_limit_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          answers_released_at?: string | null
          answers_released_by?: string | null
          classroom_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          organization_id?: string
          show_auto_score_while_pending?: boolean
          shuffle_questions?: boolean
          status?: Database['public']['Enums']['assessment_status']
          time_limit_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assessments_answers_released_by_fkey'
            columns: ['answers_released_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessments_classroom_id_fkey'
            columns: ['classroom_id']
            isOneToOne: false
            referencedRelation: 'classrooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessments_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      attempt_answers: {
        Row: {
          answered_at: string
          assessment_question_id: string
          attempt_id: string
          awarded_points: number | null
          id: string
          is_correct: boolean | null
          marked_at: string | null
          marked_by: string | null
          marker_comment: string | null
          response: Json | null
          selected_options: number[] | null
          text_answer: string | null
          time_spent_seconds: number | null
        }
        Insert: {
          answered_at?: string
          assessment_question_id: string
          attempt_id: string
          awarded_points?: number | null
          id?: string
          is_correct?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          marker_comment?: string | null
          response?: Json | null
          selected_options?: number[] | null
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Update: {
          answered_at?: string
          assessment_question_id?: string
          attempt_id?: string
          awarded_points?: number | null
          id?: string
          is_correct?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          marker_comment?: string | null
          response?: Json | null
          selected_options?: number[] | null
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'attempt_answers_assessment_question_id_fkey'
            columns: ['assessment_question_id']
            isOneToOne: false
            referencedRelation: 'assessment_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempt_answers_attempt_id_fkey'
            columns: ['attempt_id']
            isOneToOne: false
            referencedRelation: 'assessment_attempts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempt_answers_marked_by_fkey'
            columns: ['marked_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      attempt_questions: {
        Row: {
          assessment_question_id: string
          attempt_id: string
          question_order: number
        }
        Insert: {
          assessment_question_id: string
          attempt_id: string
          question_order: number
        }
        Update: {
          assessment_question_id?: string
          attempt_id?: string
          question_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'attempt_questions_assessment_question_id_fkey'
            columns: ['assessment_question_id']
            isOneToOne: false
            referencedRelation: 'assessment_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempt_questions_attempt_id_fkey'
            columns: ['attempt_id']
            isOneToOne: false
            referencedRelation: 'assessment_attempts'
            referencedColumns: ['id']
          },
        ]
      }
      classroom_students: {
        Row: {
          classroom_id: string
          created_at: string
          student_id: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          student_id: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'classroom_students_classroom_id_fkey'
            columns: ['classroom_id']
            isOneToOne: false
            referencedRelation: 'classrooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'classroom_students_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      classroom_teachers: {
        Row: {
          classroom_id: string
          created_at: string
          teacher_id: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          teacher_id: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'classroom_teachers_classroom_id_fkey'
            columns: ['classroom_id']
            isOneToOne: false
            referencedRelation: 'classrooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'classroom_teachers_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      classrooms: {
        Row: {
          cover_image_path: string | null
          created_at: string
          created_by: string
          grade_level_id: string
          id: string
          name: string
          organization_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string
          created_by: string
          grade_level_id: string
          id?: string
          name: string
          organization_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string
          created_by?: string
          grade_level_id?: string
          id?: string
          name?: string
          organization_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'classrooms_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'classrooms_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'classrooms_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'classrooms_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          parent_id: string
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          student_id: string | null
          tier: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          parent_id: string
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string | null
          tier?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          parent_id?: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string | null
          tier?: string | null
        }
        Relationships: []
      }
      practice_answers: {
        Row: {
          answered_at: string | null
          id: string
          is_correct: boolean
          question_id: string | null
          selected_options: number[] | null
          session_id: string
          text_answer: string | null
          time_spent_seconds: number | null
        }
        Insert: {
          answered_at?: string | null
          id?: string
          is_correct: boolean
          question_id?: string | null
          selected_options?: number[] | null
          session_id: string
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Update: {
          answered_at?: string | null
          id?: string
          is_correct?: boolean
          question_id?: string | null
          selected_options?: number[] | null
          session_id?: string
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'practice_answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_answers_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'practice_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      practice_sessions: {
        Row: {
          completed_at: string | null
          correct_count: number | null
          created_at: string | null
          grade_level_id: string | null
          id: string
          student_id: string
          sub_topic_id: string
          subject_id: string | null
          total_questions: number
          total_time_seconds: number | null
        }
        Insert: {
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          grade_level_id?: string | null
          id?: string
          student_id: string
          sub_topic_id: string
          subject_id?: string | null
          total_questions: number
          total_time_seconds?: number | null
        }
        Update: {
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          grade_level_id?: string | null
          id?: string
          student_id?: string
          sub_topic_id?: string
          subject_id?: string | null
          total_questions?: number
          total_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'practice_sessions_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          id: string
          name: string
          organization_id: string | null
          updated_at: string | null
          user_type: Database['public']['Enums']['user_role']
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          id: string
          name: string
          organization_id?: string | null
          updated_at?: string | null
          user_type: Database['public']['Enums']['user_role']
        }
        Update: {
          avatar_path?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string | null
          user_type?: Database['public']['Enums']['user_role']
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      question_tags: {
        Row: {
          created_at: string
          question_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'question_tags_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_tags_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      questions: {
        Row: {
          answer: string | null
          created_at: string | null
          grade_level_id: string | null
          id: string
          image_hash: string | null
          image_path: string | null
          option_1_image_path: string | null
          option_1_is_correct: boolean | null
          option_1_text: string | null
          option_1_tip: string | null
          option_2_image_path: string | null
          option_2_is_correct: boolean | null
          option_2_text: string | null
          option_2_tip: string | null
          option_3_image_path: string | null
          option_3_is_correct: boolean | null
          option_3_text: string | null
          option_3_tip: string | null
          option_4_image_path: string | null
          option_4_is_correct: boolean | null
          option_4_text: string | null
          option_4_tip: string | null
          question: string
          sub_topic_id: string
          subject_id: string | null
          type: Database['public']['Enums']['question_type']
          updated_at: string
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          grade_level_id?: string | null
          id?: string
          image_hash?: string | null
          image_path?: string | null
          option_1_image_path?: string | null
          option_1_is_correct?: boolean | null
          option_1_text?: string | null
          option_1_tip?: string | null
          option_2_image_path?: string | null
          option_2_is_correct?: boolean | null
          option_2_text?: string | null
          option_2_tip?: string | null
          option_3_image_path?: string | null
          option_3_is_correct?: boolean | null
          option_3_text?: string | null
          option_3_tip?: string | null
          option_4_image_path?: string | null
          option_4_is_correct?: boolean | null
          option_4_text?: string | null
          option_4_tip?: string | null
          question: string
          sub_topic_id: string
          subject_id?: string | null
          type: Database['public']['Enums']['question_type']
          updated_at?: string
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          grade_level_id?: string | null
          id?: string
          image_hash?: string | null
          image_path?: string | null
          option_1_image_path?: string | null
          option_1_is_correct?: boolean | null
          option_1_text?: string | null
          option_1_tip?: string | null
          option_2_image_path?: string | null
          option_2_is_correct?: boolean | null
          option_2_text?: string | null
          option_2_tip?: string | null
          option_3_image_path?: string | null
          option_3_is_correct?: boolean | null
          option_3_text?: string | null
          option_3_tip?: string | null
          option_4_image_path?: string | null
          option_4_is_correct?: boolean | null
          option_4_text?: string | null
          option_4_tip?: string | null
          question?: string
          sub_topic_id?: string
          subject_id?: string | null
          type?: Database['public']['Enums']['question_type']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'questions_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      session_questions: {
        Row: {
          id: string
          question_id: string
          question_order: number
          session_id: string
        }
        Insert: {
          id?: string
          question_id: string
          question_order: number
          session_id: string
        }
        Update: {
          id?: string
          question_id?: string
          question_order?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'session_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'session_questions_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'practice_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      student_profiles: {
        Row: {
          created_at: string | null
          created_by: string | null
          grade_level_id: string | null
          id: string
          preferred_language: string
          school_id: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          grade_level_id?: string | null
          id: string
          preferred_language?: string
          school_id?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          grade_level_id?: string | null
          id?: string
          preferred_language?: string
          school_id?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'student_profiles_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_school_id_fkey'
            columns: ['school_id']
            isOneToOne: false
            referencedRelation: 'schools'
            referencedColumns: ['id']
          },
        ]
      }
      student_question_progress: {
        Row: {
          created_at: string
          cycle_number: number
          id: string
          question_id: string
          student_id: string
          sub_topic_id: string
        }
        Insert: {
          created_at?: string
          cycle_number?: number
          id?: string
          question_id: string
          student_id: string
          sub_topic_id: string
        }
        Update: {
          created_at?: string
          cycle_number?: number
          id?: string
          question_id?: string
          student_id?: string
          sub_topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_question_progress_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      student_sub_topic_stats: {
        Row: {
          best_score_percent: number
          last_completed_at: string | null
          sessions_completed: number
          student_id: string
          sub_topic_id: string
        }
        Insert: {
          best_score_percent?: number
          last_completed_at?: string | null
          sessions_completed?: number
          student_id: string
          sub_topic_id: string
        }
        Update: {
          best_score_percent?: number
          last_completed_at?: string | null
          sessions_completed?: number
          student_id?: string
          sub_topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_sub_topic_stats_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_sub_topic_stats_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      sub_topics: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          topic_id: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          topic_id: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          topic_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sub_topics_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }
      subjects: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          grade_level_id: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          grade_level_id: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          grade_level_id?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'subjects_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          subject_id: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          subject_id: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          subject_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'topics_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assessment_payload_is_valid: { Args: { p: Json }; Returns: boolean }
      clone_assessment_template: {
        Args: { p_classroom_id: string; p_template_id: string }
        Returns: string
      }
      complete_assessment_attempt: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      get_assessment_completion: {
        Args: { p_assessment_id: string }
        Returns: Json
      }
      get_attempt_questions: { Args: { p_attempt_id: string }; Returns: Json }
      get_attempt_result: { Args: { p_attempt_id: string }; Returns: Json }
      get_bank_questions: {
        Args: { p_sub_topic_id?: string }
        Returns: {
          answer: string | null
          created_at: string | null
          grade_level_id: string | null
          id: string
          image_hash: string | null
          image_path: string | null
          option_1_image_path: string | null
          option_1_is_correct: boolean | null
          option_1_text: string | null
          option_1_tip: string | null
          option_2_image_path: string | null
          option_2_is_correct: boolean | null
          option_2_text: string | null
          option_2_tip: string | null
          option_3_image_path: string | null
          option_3_is_correct: boolean | null
          option_3_text: string | null
          option_3_tip: string | null
          option_4_image_path: string | null
          option_4_is_correct: boolean | null
          option_4_text: string | null
          option_4_tip: string | null
          question: string
          sub_topic_id: string
          subject_id: string | null
          type: Database['public']['Enums']['question_type']
          updated_at: string
        }[]
        SetofOptions: {
          from: '*'
          to: 'questions'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_class_rollups: {
        Args: { p_organization_id?: string }
        Returns: {
          assigned_attempts: number
          avg_assessment_score: number
          avg_map_mastery: number
          classroom_id: string
          classroom_name: string
          completed_attempts: number
          grade_level_id: string
          grade_level_name: string
          student_count: number
          subject_id: string
          subject_name: string
          teacher_count: number
        }[]
      }
      get_org_overview: {
        Args: never
        Returns: {
          assessment_count: number
          classroom_count: number
          last_activity_at: string
          manager_count: number
          organization_id: string
          organization_name: string
          student_count: number
          teacher_count: number
        }[]
      }
      get_platform_totals: { Args: never; Returns: Json }
      get_practice_questions: {
        Args: { p_question_ids: string[] }
        Returns: Json
      }
      get_practice_session_questions: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_session_result: { Args: { p_session_id: string }; Returns: Json }
      get_student_rollups: {
        Args: { p_classroom_id?: string; p_organization_id?: string }
        Returns: {
          assigned_count: number
          at_risk: boolean
          avg_assessment_score: number
          completed_count: number
          last_practice_at: string
          map_mastery: number
          student_id: string
          student_name: string
          sub_topics_attempted: number
          sub_topics_completed: number
          username: string
        }[]
      }
      get_subtopic_answered_counts: {
        Args: never
        Returns: {
          answered_count: number
          sub_topic_id: string
        }[]
      }
      get_template_questions: {
        Args: { p_template_id: string }
        Returns: {
          difficulty: Database['public']['Enums']['question_difficulty']
          id: string
          payload: Json
          points: number
          position: number
          sub_topic_id: string
          tag_ids: string[]
        }[]
      }
      mark_attempt_answer: {
        Args: { p_answer_id: string; p_comment?: string; p_points: number }
        Returns: Json
      }
      release_assessment_answers: {
        Args: { p_assessment_id: string; p_released?: boolean }
        Returns: Json
      }
      reorder_assessment_questions: {
        Args: { p_assessment_id: string; p_ids: string[] }
        Returns: undefined
      }
      reorder_grade_levels: { Args: { p_ids: string[] }; Returns: undefined }
      reorder_sub_topics: {
        Args: { p_ids: string[]; p_topic_id: string }
        Returns: undefined
      }
      reorder_subjects: {
        Args: { p_grade_level_id: string; p_ids: string[] }
        Returns: undefined
      }
      reorder_template_questions: {
        Args: { p_ids: string[]; p_template_id: string }
        Returns: undefined
      }
      reorder_topics: {
        Args: { p_ids: string[]; p_subject_id: string }
        Returns: undefined
      }
      start_assessment_attempt: {
        Args: { p_assessment_id: string }
        Returns: Json
      }
      submit_practice_session: {
        Args: {
          p_answers: Json
          p_cycle_number: number
          p_sub_topic_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      assessment_status: 'draft' | 'published'
      question_difficulty: 'low' | 'medium' | 'high'
      question_type: 'mcq' | 'short_answer' | 'mrq'
      user_role: 'admin' | 'manager' | 'teacher' | 'student'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assessment_status: ['draft', 'published'],
      question_difficulty: ['low', 'medium', 'high'],
      question_type: ['mcq', 'short_answer', 'mrq'],
      user_role: ['admin', 'manager', 'teacher', 'student'],
    },
  },
} as const
