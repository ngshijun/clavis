export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	graphql_public: {
		Tables: {
			[_ in never]: never;
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			graphql: {
				Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
				Returns: Json;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
	public: {
		Tables: {
			assignment_students: {
				Row: {
					assignment_id: string;
					classroom_id: string;
					seen_at: string | null;
					session_id: string | null;
					student_id: string;
				};
				Insert: {
					assignment_id: string;
					classroom_id: string;
					seen_at?: string | null;
					session_id?: string | null;
					student_id: string;
				};
				Update: {
					assignment_id?: string;
					classroom_id?: string;
					seen_at?: string | null;
					session_id?: string | null;
					student_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'assignment_students_assignment_fkey';
						columns: ['assignment_id', 'classroom_id'];
						isOneToOne: false;
						referencedRelation: 'assignments';
						referencedColumns: ['id', 'classroom_id'];
					},
					{
						foreignKeyName: 'assignment_students_session_id_fkey';
						columns: ['session_id'];
						isOneToOne: false;
						referencedRelation: 'practice_sessions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'assignment_students_student_fkey';
						columns: ['classroom_id', 'student_id'];
						isOneToOne: false;
						referencedRelation: 'classroom_students';
						referencedColumns: ['classroom_id', 'student_id'];
					}
				];
			};
			assignments: {
				Row: {
					assigned_by: string | null;
					classroom_id: string;
					created_at: string;
					due_at: string | null;
					id: string;
					stage_id: string;
				};
				Insert: {
					assigned_by?: string | null;
					classroom_id: string;
					created_at?: string;
					due_at?: string | null;
					id?: string;
					stage_id: string;
				};
				Update: {
					assigned_by?: string | null;
					classroom_id?: string;
					created_at?: string;
					due_at?: string | null;
					id?: string;
					stage_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'assignments_assigned_by_fkey';
						columns: ['assigned_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'assignments_classroom_id_fkey';
						columns: ['classroom_id'];
						isOneToOne: false;
						referencedRelation: 'classrooms';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'assignments_stage_id_fkey';
						columns: ['stage_id'];
						isOneToOne: false;
						referencedRelation: 'stages';
						referencedColumns: ['id'];
					}
				];
			};
			classroom_students: {
				Row: {
					classroom_id: string;
					created_at: string;
					student_id: string;
				};
				Insert: {
					classroom_id: string;
					created_at?: string;
					student_id: string;
				};
				Update: {
					classroom_id?: string;
					created_at?: string;
					student_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'classroom_students_classroom_id_fkey';
						columns: ['classroom_id'];
						isOneToOne: false;
						referencedRelation: 'classrooms';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'classroom_students_student_id_fkey';
						columns: ['student_id'];
						isOneToOne: false;
						referencedRelation: 'student_profiles';
						referencedColumns: ['id'];
					}
				];
			};
			classroom_teachers: {
				Row: {
					classroom_id: string;
					created_at: string;
					teacher_id: string;
				};
				Insert: {
					classroom_id: string;
					created_at?: string;
					teacher_id: string;
				};
				Update: {
					classroom_id?: string;
					created_at?: string;
					teacher_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'classroom_teachers_classroom_id_fkey';
						columns: ['classroom_id'];
						isOneToOne: false;
						referencedRelation: 'classrooms';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'classroom_teachers_teacher_id_fkey';
						columns: ['teacher_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			classrooms: {
				Row: {
					archived_at: string | null;
					cover_image_path: string | null;
					created_at: string;
					created_by: string;
					grade_level_id: string;
					id: string;
					name: string;
					organization_id: string;
					subject_id: string;
					updated_at: string;
				};
				Insert: {
					archived_at?: string | null;
					cover_image_path?: string | null;
					created_at?: string;
					created_by: string;
					grade_level_id: string;
					id?: string;
					name: string;
					organization_id: string;
					subject_id: string;
					updated_at?: string;
				};
				Update: {
					archived_at?: string | null;
					cover_image_path?: string | null;
					created_at?: string;
					created_by?: string;
					grade_level_id?: string;
					id?: string;
					name?: string;
					organization_id?: string;
					subject_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'classrooms_created_by_fkey';
						columns: ['created_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'classrooms_grade_level_id_fkey';
						columns: ['grade_level_id'];
						isOneToOne: false;
						referencedRelation: 'grade_levels';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'classrooms_organization_id_fkey';
						columns: ['organization_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'classrooms_subject_id_fkey';
						columns: ['subject_id'];
						isOneToOne: false;
						referencedRelation: 'subjects';
						referencedColumns: ['id'];
					}
				];
			};
			grade_levels: {
				Row: {
					created_at: string | null;
					display_order: number | null;
					id: string;
					name: string;
					updated_at: string | null;
				};
				Insert: {
					created_at?: string | null;
					display_order?: number | null;
					id?: string;
					name: string;
					updated_at?: string | null;
				};
				Update: {
					created_at?: string | null;
					display_order?: number | null;
					id?: string;
					name?: string;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			organizations: {
				Row: {
					created_at: string;
					id: string;
					name: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					name: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					name?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			passages: {
				Row: {
					body: string;
					created_at: string;
					display_order: number;
					id: string;
					image_path: string | null;
					stage_id: string;
					title: string;
					updated_at: string;
				};
				Insert: {
					body?: string;
					created_at?: string;
					display_order?: number;
					id?: string;
					image_path?: string | null;
					stage_id: string;
					title: string;
					updated_at?: string;
				};
				Update: {
					body?: string;
					created_at?: string;
					display_order?: number;
					id?: string;
					image_path?: string | null;
					stage_id?: string;
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'passages_stage_id_fkey';
						columns: ['stage_id'];
						isOneToOne: false;
						referencedRelation: 'stages';
						referencedColumns: ['id'];
					}
				];
			};
			practice_answers: {
				Row: {
					answered_at: string | null;
					id: string;
					is_correct: boolean;
					marks: number;
					question_id: string | null;
					response: Json | null;
					selected_options: number[] | null;
					session_id: string;
					text_answer: string | null;
				};
				Insert: {
					answered_at?: string | null;
					id?: string;
					is_correct: boolean;
					marks?: number;
					question_id?: string | null;
					response?: Json | null;
					selected_options?: number[] | null;
					session_id: string;
					text_answer?: string | null;
				};
				Update: {
					answered_at?: string | null;
					id?: string;
					is_correct?: boolean;
					marks?: number;
					question_id?: string | null;
					response?: Json | null;
					selected_options?: number[] | null;
					session_id?: string;
					text_answer?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'practice_answers_question_id_fkey';
						columns: ['question_id'];
						isOneToOne: false;
						referencedRelation: 'questions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'practice_answers_session_id_fkey';
						columns: ['session_id'];
						isOneToOne: false;
						referencedRelation: 'practice_sessions';
						referencedColumns: ['id'];
					}
				];
			};
			practice_sessions: {
				Row: {
					classroom_id: string;
					completed_at: string | null;
					created_at: string | null;
					grade_level_id: string | null;
					id: string;
					marks: number;
					stage_id: string;
					student_id: string;
					subject_id: string | null;
					total_questions: number;
				};
				Insert: {
					classroom_id: string;
					completed_at?: string | null;
					created_at?: string | null;
					grade_level_id?: string | null;
					id?: string;
					marks: number;
					stage_id: string;
					student_id: string;
					subject_id?: string | null;
					total_questions: number;
				};
				Update: {
					classroom_id?: string;
					completed_at?: string | null;
					created_at?: string | null;
					grade_level_id?: string | null;
					id?: string;
					marks?: number;
					stage_id?: string;
					student_id?: string;
					subject_id?: string | null;
					total_questions?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'practice_sessions_classroom_id_fkey';
						columns: ['classroom_id'];
						isOneToOne: false;
						referencedRelation: 'classrooms';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'practice_sessions_grade_level_id_fkey';
						columns: ['grade_level_id'];
						isOneToOne: false;
						referencedRelation: 'grade_levels';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'practice_sessions_stage_id_fkey';
						columns: ['stage_id'];
						isOneToOne: false;
						referencedRelation: 'stages';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'practice_sessions_student_id_fkey';
						columns: ['student_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'practice_sessions_subject_id_fkey';
						columns: ['subject_id'];
						isOneToOne: false;
						referencedRelation: 'subjects';
						referencedColumns: ['id'];
					}
				];
			};
			profiles: {
				Row: {
					avatar_path: string | null;
					created_at: string | null;
					email: string;
					id: string;
					name: string;
					organization_id: string | null;
					updated_at: string | null;
					user_type: Database['public']['Enums']['user_role'];
				};
				Insert: {
					avatar_path?: string | null;
					created_at?: string | null;
					email: string;
					id: string;
					name: string;
					organization_id?: string | null;
					updated_at?: string | null;
					user_type: Database['public']['Enums']['user_role'];
				};
				Update: {
					avatar_path?: string | null;
					created_at?: string | null;
					email?: string;
					id?: string;
					name?: string;
					organization_id?: string | null;
					updated_at?: string | null;
					user_type?: Database['public']['Enums']['user_role'];
				};
				Relationships: [
					{
						foreignKeyName: 'profiles_organization_id_fkey';
						columns: ['organization_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			question_tags: {
				Row: {
					created_at: string;
					question_id: string;
					tag_id: string;
				};
				Insert: {
					created_at?: string;
					question_id: string;
					tag_id: string;
				};
				Update: {
					created_at?: string;
					question_id?: string;
					tag_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'question_tags_question_id_fkey';
						columns: ['question_id'];
						isOneToOne: false;
						referencedRelation: 'questions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'question_tags_tag_id_fkey';
						columns: ['tag_id'];
						isOneToOne: false;
						referencedRelation: 'tags';
						referencedColumns: ['id'];
					}
				];
			};
			questions: {
				Row: {
					created_at: string | null;
					difficulty: Database['public']['Enums']['question_difficulty'];
					display_order: number;
					grade_level_id: string | null;
					id: string;
					passage_id: string | null;
					payload: NonNullable<Json>;
					stage_id: string;
					subject_id: string | null;
					updated_at: string;
				};
				Insert: {
					created_at?: string | null;
					difficulty?: Database['public']['Enums']['question_difficulty'];
					display_order?: number;
					grade_level_id?: string | null;
					id?: string;
					passage_id?: string | null;
					payload: NonNullable<Json>;
					stage_id: string;
					subject_id?: string | null;
					updated_at?: string;
				};
				Update: {
					created_at?: string | null;
					difficulty?: Database['public']['Enums']['question_difficulty'];
					display_order?: number;
					grade_level_id?: string | null;
					id?: string;
					passage_id?: string | null;
					payload?: NonNullable<Json>;
					stage_id?: string;
					subject_id?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'questions_grade_level_id_fkey';
						columns: ['grade_level_id'];
						isOneToOne: false;
						referencedRelation: 'grade_levels';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'questions_passage_id_stage_id_fkey';
						columns: ['passage_id', 'stage_id'];
						isOneToOne: false;
						referencedRelation: 'passages';
						referencedColumns: ['id', 'stage_id'];
					},
					{
						foreignKeyName: 'questions_stage_id_fkey';
						columns: ['stage_id'];
						isOneToOne: false;
						referencedRelation: 'stages';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'questions_subject_id_fkey';
						columns: ['subject_id'];
						isOneToOne: false;
						referencedRelation: 'subjects';
						referencedColumns: ['id'];
					}
				];
			};
			stages: {
				Row: {
					created_at: string;
					display_order: number;
					id: string;
					name: string;
					question_order: string;
					topic_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					display_order?: number;
					id?: string;
					name: string;
					question_order?: string;
					topic_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					display_order?: number;
					id?: string;
					name?: string;
					question_order?: string;
					topic_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'stages_topic_id_fkey';
						columns: ['topic_id'];
						isOneToOne: false;
						referencedRelation: 'topics';
						referencedColumns: ['id'];
					}
				];
			};
			student_profiles: {
				Row: {
					created_at: string | null;
					created_by: string | null;
					grade_level_id: string | null;
					id: string;
					updated_at: string | null;
					username: string | null;
				};
				Insert: {
					created_at?: string | null;
					created_by?: string | null;
					grade_level_id?: string | null;
					id: string;
					updated_at?: string | null;
					username?: string | null;
				};
				Update: {
					created_at?: string | null;
					created_by?: string | null;
					grade_level_id?: string | null;
					id?: string;
					updated_at?: string | null;
					username?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'student_profiles_created_by_fkey';
						columns: ['created_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'student_profiles_grade_level_id_fkey';
						columns: ['grade_level_id'];
						isOneToOne: false;
						referencedRelation: 'grade_levels';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'student_profiles_id_fkey';
						columns: ['id'];
						isOneToOne: true;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			subjects: {
				Row: {
					cover_image_path: string | null;
					created_at: string | null;
					display_order: number | null;
					grade_level_id: string;
					id: string;
					name: string;
					updated_at: string | null;
				};
				Insert: {
					cover_image_path?: string | null;
					created_at?: string | null;
					display_order?: number | null;
					grade_level_id: string;
					id?: string;
					name: string;
					updated_at?: string | null;
				};
				Update: {
					cover_image_path?: string | null;
					created_at?: string | null;
					display_order?: number | null;
					grade_level_id?: string;
					id?: string;
					name?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'subjects_grade_level_id_fkey';
						columns: ['grade_level_id'];
						isOneToOne: false;
						referencedRelation: 'grade_levels';
						referencedColumns: ['id'];
					}
				];
			};
			tag_topics: {
				Row: {
					created_at: string;
					tag_id: string;
					topic_id: string;
				};
				Insert: {
					created_at?: string;
					tag_id: string;
					topic_id: string;
				};
				Update: {
					created_at?: string;
					tag_id?: string;
					topic_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'tag_topics_tag_id_fkey';
						columns: ['tag_id'];
						isOneToOne: false;
						referencedRelation: 'tags';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tag_topics_topic_id_fkey';
						columns: ['topic_id'];
						isOneToOne: false;
						referencedRelation: 'topics';
						referencedColumns: ['id'];
					}
				];
			};
			tags: {
				Row: {
					created_at: string;
					id: string;
					name: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					name: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					name?: string;
				};
				Relationships: [];
			};
			topics: {
				Row: {
					cover_image_path: string | null;
					created_at: string | null;
					display_order: number | null;
					id: string;
					name: string;
					subject_id: string;
					updated_at: string | null;
				};
				Insert: {
					cover_image_path?: string | null;
					created_at?: string | null;
					display_order?: number | null;
					id?: string;
					name: string;
					subject_id: string;
					updated_at?: string | null;
				};
				Update: {
					cover_image_path?: string | null;
					created_at?: string | null;
					display_order?: number | null;
					id?: string;
					name?: string;
					subject_id?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'topics_subject_id_fkey';
						columns: ['subject_id'];
						isOneToOne: false;
						referencedRelation: 'subjects';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			assign_stage: {
				Args: {
					p_classroom_id: string;
					p_due_at: string;
					p_stage_id: string;
					p_student_ids: string[];
				};
				Returns: string;
			};
			classroom_teacher_names: {
				Args: Record<PropertyKey, never>;
				Returns: {
					classroom_id: string;
					name: string;
				}[];
			};
			delete_organization: {
				Args: { p_name: string; p_organization_id: string };
				Returns: string[];
			};
			get_bank_questions: {
				Args: { p_stage_id?: string };
				Returns: {
					created_at: string | null;
					difficulty: Database['public']['Enums']['question_difficulty'];
					display_order: number;
					grade_level_id: string | null;
					id: string;
					passage_id: string | null;
					payload: NonNullable<Json>;
					stage_id: string;
					subject_id: string | null;
					updated_at: string;
				}[];
				SetofOptions: {
					from: '*';
					to: 'questions';
					isOneToOne: false;
					isSetofReturn: true;
				};
			};
			import_stage_rows: {
				Args: { p_passages: Json; p_questions: Json; p_stage_id: string };
				Returns: number;
			};
			item_payload_is_valid: { Args: { p: Json }; Returns: boolean };
			list_notifications: {
				Args: Record<PropertyKey, never>;
				Returns: {
					assignment_id: string;
					classroom_id: string;
					done_at: string;
					marks: number;
					seen: boolean;
					stage_name: string;
					student_id: string;
					student_name: string;
					total: number;
					unread: number;
				}[];
			};
			mark_notifications_seen: { Args: { p_assignment_id: string }; Returns: undefined };
			reorder_grade_levels: { Args: { p_ids: string[] }; Returns: undefined };
			reorder_passage_questions: {
				Args: { p_ids: string[]; p_passage_id: string };
				Returns: undefined;
			};
			reorder_stage_entries: { Args: { p_ids: string[]; p_stage_id: string }; Returns: undefined };
			reorder_stages: { Args: { p_ids: string[]; p_topic_id: string }; Returns: undefined };
			reorder_subjects: { Args: { p_grade_level_id: string; p_ids: string[] }; Returns: undefined };
			reorder_topics: { Args: { p_ids: string[]; p_subject_id: string }; Returns: undefined };
			review_practice_session: { Args: { p_session_id: string }; Returns: Json };
			serve_practice_stage: { Args: { p_classroom_id: string; p_stage_id: string }; Returns: Json };
			submit_practice_session: {
				Args: { p_answers: Json; p_classroom_id: string; p_stage_id: string };
				Returns: Json;
			};
		};
		Enums: {
			question_difficulty: 'low' | 'medium' | 'high';
			user_role: 'admin' | 'manager' | 'teacher' | 'student';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never) = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends (DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never) = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never) = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	graphql_public: {
		Enums: {}
	},
	public: {
		Enums: {
			question_difficulty: ['low', 'medium', 'high'],
			user_role: ['admin', 'manager', 'teacher', 'student']
		}
	}
} as const;
