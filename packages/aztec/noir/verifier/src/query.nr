use crate::verify::Disclosure;
use aztec::protocol::{address::AztecAddress, traits::ToField};
use zkpassport::commitments::{
    age_commitment, bind_user_address_commitment, birthdate_commitment, disclose_commitment,
    expiry_date_commitment, issuing_country_exclusion_commitment,
    issuing_country_inclusion_commitment, nationality_exclusion_commitment,
    nationality_inclusion_commitment, sanctions_commitment,
};
use zkpassport::disclosed_data::{
    disclosed_birthdate, disclosed_document_number, disclosed_document_type, disclosed_expiry_date,
    disclosed_gender, disclosed_issuing_country, disclosed_name, disclosed_nationality,
};

/// What a contract asks a ZKPassport proof to show, in the terms of the ZKPassport SDK's query.
///
/// Start with [`Query::new`], call one method per check, and pass the query to
/// [`verify_zkpassport_proof`](crate::verify::verify_zkpassport_proof). `K` counts the outer
/// proof's subproofs and `D` is 1 once a field is disclosed. Both follow from the methods called,
/// so only a `global` query spells them out.
///
/// Disclosing any field but the document type or the issuing country needs the document type
/// disclosed too, so the SDK request must ask for it.
///
/// ## Examples
///
/// ```noir
/// let query = Query::new().age_min(18).disclose_nationality().bind_user_address(user);
/// let verified = verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query);
/// ```
pub struct Query<let K: u32, let D: u32> {
    commitments: BoundedVec<Field, K>,
    checks: u16,
    disclosed_fields: u8,
    sanctions: Option<bool>, // strict
}

// The checks a query asks for at most once
global CHECK_AGE: u16 = 1;
global CHECK_BIRTHDATE: u16 = 2;
global CHECK_EXPIRY_DATE: u16 = 4;
global CHECK_NATIONALITY_INCLUSION: u16 = 8;
global CHECK_NATIONALITY_EXCLUSION: u16 = 16;
global CHECK_ISSUING_COUNTRY_INCLUSION: u16 = 32;
global CHECK_ISSUING_COUNTRY_EXCLUSION: u16 = 64;
global CHECK_BIND: u16 = 128;
global CHECK_SANCTIONS: u16 = 256;

// The MRZ fields a query can ask to be disclosed
global FIELD_DOCUMENT_TYPE: u8 = 1;
global FIELD_ISSUING_COUNTRY: u8 = 2;
global FIELD_DOCUMENT_NUMBER: u8 = 4;
global FIELD_NATIONALITY: u8 = 8;
global FIELD_BIRTHDATE: u8 = 16;
global FIELD_EXPIRY_DATE: u8 = 32;
global FIELD_GENDER: u8 = 64;
global FIELD_NAME: u8 = 128;

impl Query<3, 0> {
    /// Start a query that asks for nothing beyond what every proof shows.
    pub fn new() -> Self {
        Query {
            commitments: BoundedVec::new(),
            checks: 0,
            disclosed_fields: 0,
            sanctions: Option::none(),
        }
    }
}

impl<let K: u32, let D: u32> Query<K, D> {
    /// Ask for an age of at least `min`, below 100.
    pub fn age_min(self, min: u8) -> Query<K + 1, D> {
        self.age_between(min, 0)
    }

    /// Ask for an age of at most `max`, below 100.
    pub fn age_max(self, max: u8) -> Query<K + 1, D> {
        self.age_between(0, max)
    }

    /// Ask for an age between `min` and `max`, both included.
    pub fn age_between(self, min: u8, max: u8) -> Query<K + 1, D> {
        self.with_commitment(CHECK_AGE, "age requested twice", age_commitment(min, max))
    }

    /// Ask for a date of birth on or after `min`, in Unix seconds.
    pub fn birthdate_min(self, min: i64) -> Query<K + 1, D> {
        self.birthdate_between(min, 0)
    }

    /// Ask for a date of birth on or before `max`, in Unix seconds.
    pub fn birthdate_max(self, max: i64) -> Query<K + 1, D> {
        self.birthdate_between(0, max)
    }

    /// Ask for a date of birth between `min` and `max`, both included, in Unix seconds.
    pub fn birthdate_between(self, min: i64, max: i64) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_BIRTHDATE,
            "birthdate requested twice",
            birthdate_commitment(min, max),
        )
    }

    /// Ask for an expiry date on or after `min`, in Unix seconds.
    pub fn expiry_date_min(self, min: u64) -> Query<K + 1, D> {
        self.expiry_date_between(min, 0)
    }

    /// Ask for an expiry date on or before `max`, in Unix seconds.
    pub fn expiry_date_max(self, max: u64) -> Query<K + 1, D> {
        self.expiry_date_between(0, max)
    }

    /// Ask for an expiry date between `min` and `max`, both included, in Unix seconds.
    pub fn expiry_date_between(self, min: u64, max: u64) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_EXPIRY_DATE,
            "expiry date requested twice",
            expiry_date_commitment(min, max),
        )
    }

    /// Ask for a nationality in `countries`, listed in the order the SDK request lists them.
    pub fn nationality_in<let N: u32>(self, countries: [str<3>; N]) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_NATIONALITY_INCLUSION,
            "nationality inclusion requested twice",
            nationality_inclusion_commitment(countries),
        )
    }

    /// Ask for a nationality not in `countries`.
    pub fn nationality_out<let N: u32>(self, countries: [str<3>; N]) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_NATIONALITY_EXCLUSION,
            "nationality exclusion requested twice",
            nationality_exclusion_commitment(countries),
        )
    }

    /// Ask for an issuing country in `countries`, listed in the order the SDK request lists them.
    pub fn issuing_country_in<let N: u32>(self, countries: [str<3>; N]) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_ISSUING_COUNTRY_INCLUSION,
            "issuing country inclusion requested twice",
            issuing_country_inclusion_commitment(countries),
        )
    }

    /// Ask for an issuing country not in `countries`.
    pub fn issuing_country_out<let N: u32>(self, countries: [str<3>; N]) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_ISSUING_COUNTRY_EXCLUSION,
            "issuing country exclusion requested twice",
            issuing_country_exclusion_commitment(countries),
        )
    }

    /// Ask for the proof to be bound to `address`.
    pub fn bind_user_address(self, address: AztecAddress) -> Query<K + 1, D> {
        self.with_commitment(
            CHECK_BIND,
            "bind requested twice",
            bind_user_address_commitment(address.to_field()),
        )
    }

    /// Ask for the holder not to be on the sanctions lists. The client stashes the sanctions root
    /// the proof was made against in the sanctions capsule.
    pub fn sanctions(self) -> Query<K + 1, D> {
        self.with_sanctions(false)
    }

    /// Ask for the holder not to be on the sanctions lists, screened in strict mode.
    pub fn strict_sanctions(self) -> Query<K + 1, D> {
        self.with_sanctions(true)
    }

    pub(crate) fn sanctions_requested(self) -> bool {
        self.sanctions.is_some()
    }

    pub(crate) fn expected_commitments(
        self,
        disclosure: Option<Disclosure>,
        sanctions_root: Option<Field>,
    ) -> [Field; K - 3] {
        let mut expected: BoundedVec<Field, K - 3> = BoundedVec::new();
        for i in 0..K - 3 {
            if i < self.commitments.len() {
                expected.push(self.commitments.get_unchecked(i));
            }
        }

        if disclosure.is_some() {
            let disclosure = disclosure.unwrap();
            expected.push(disclose_commitment(disclosure.mask, disclosure.bytes));
        }

        if sanctions_root.is_some() {
            expected.push(sanctions_commitment(sanctions_root.unwrap(), self.sanctions.unwrap()));
        }

        assert(expected.len() == K - 3, "wrong number of expected commitments");
        expected.storage()
    }

    pub(crate) fn assert_disclosed(self, disclosure: Disclosure) {
        let (mask, bytes) = (disclosure.mask, disclosure.bytes);
        if self.disclosed_fields & FIELD_DOCUMENT_TYPE != 0 {
            let _ = disclosed_document_type(mask, bytes);
        }
        if self.disclosed_fields & FIELD_ISSUING_COUNTRY != 0 {
            let _ = disclosed_issuing_country(mask, bytes);
        }
        if self.disclosed_fields & FIELD_DOCUMENT_NUMBER != 0 {
            let _ = disclosed_document_number(mask, bytes);
        }
        if self.disclosed_fields & FIELD_NATIONALITY != 0 {
            let _ = disclosed_nationality(mask, bytes);
        }
        if self.disclosed_fields & FIELD_BIRTHDATE != 0 {
            let _ = disclosed_birthdate(mask, bytes);
        }
        if self.disclosed_fields & FIELD_EXPIRY_DATE != 0 {
            let _ = disclosed_expiry_date(mask, bytes);
        }
        if self.disclosed_fields & FIELD_GENDER != 0 {
            let _ = disclosed_gender(mask, bytes);
        }
        if self.disclosed_fields & FIELD_NAME != 0 {
            let _ = disclosed_name(mask, bytes);
        }
    }

    fn with_commitment<let M: u32>(
        self,
        check: u16,
        message: str<M>,
        commitment: Field,
    ) -> Query<K + 1, D> {
        let mut query = self.with_check(check, message);
        query.commitments.push(commitment);
        query
    }

    fn with_sanctions(self, strict: bool) -> Query<K + 1, D> {
        let mut query = self.with_check(CHECK_SANCTIONS, "sanctions requested twice");
        query.sanctions = Option::some(strict);
        query
    }

    fn with_check<let M: u32>(self, check: u16, message: str<M>) -> Query<K + 1, D> {
        assert(self.checks & check == 0, message);

        let mut query = self.resized();
        query.checks |= check;
        query
    }

    fn resized<let L: u32, let E: u32>(self) -> Query<L, E> {
        let mut commitments = BoundedVec::new();
        for i in 0..K {
            if i < self.commitments.len() {
                commitments.push(self.commitments.get_unchecked(i));
            }
        }
        Query {
            commitments,
            checks: self.checks,
            disclosed_fields: self.disclosed_fields,
            sanctions: self.sanctions,
        }
    }
}

impl<let K: u32> Query<K, 0> {
    /// Ask for the document code to be disclosed, such as "P<" for a passport.
    pub fn disclose_document_type(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_DOCUMENT_TYPE)
    }

    /// Ask for the issuing country to be disclosed.
    pub fn disclose_issuing_country(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_ISSUING_COUNTRY)
    }

    /// Ask for the document number to be disclosed.
    pub fn disclose_document_number(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_DOCUMENT_NUMBER)
    }

    /// Ask for the nationality to be disclosed.
    pub fn disclose_nationality(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_NATIONALITY)
    }

    /// Ask for the date of birth to be disclosed.
    pub fn disclose_birthdate(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_BIRTHDATE)
    }

    /// Ask for the expiry date to be disclosed.
    pub fn disclose_expiry_date(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_EXPIRY_DATE)
    }

    /// Ask for the gender to be disclosed.
    pub fn disclose_gender(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_GENDER)
    }

    /// Ask for the name to be disclosed. A request for the first or last name alone discloses
    /// only that part of the name field.
    pub fn disclose_name(self) -> Query<K + 1, 1> {
        self.first_disclosure(FIELD_NAME)
    }

    fn first_disclosure(self, field: u8) -> Query<K + 1, 1> {
        let mut query = self.resized();
        query.disclosed_fields = field;
        query
    }
}

// Once one field is disclosed, the others share its disclose subproof.
impl<let K: u32> Query<K, 1> {
    /// Ask for the document code to be disclosed, such as "P<" for a passport.
    pub fn disclose_document_type(self) -> Self {
        self.another_disclosure(FIELD_DOCUMENT_TYPE)
    }

    /// Ask for the issuing country to be disclosed.
    pub fn disclose_issuing_country(self) -> Self {
        self.another_disclosure(FIELD_ISSUING_COUNTRY)
    }

    /// Ask for the document number to be disclosed.
    pub fn disclose_document_number(self) -> Self {
        self.another_disclosure(FIELD_DOCUMENT_NUMBER)
    }

    /// Ask for the nationality to be disclosed.
    pub fn disclose_nationality(self) -> Self {
        self.another_disclosure(FIELD_NATIONALITY)
    }

    /// Ask for the date of birth to be disclosed.
    pub fn disclose_birthdate(self) -> Self {
        self.another_disclosure(FIELD_BIRTHDATE)
    }

    /// Ask for the expiry date to be disclosed.
    pub fn disclose_expiry_date(self) -> Self {
        self.another_disclosure(FIELD_EXPIRY_DATE)
    }

    /// Ask for the gender to be disclosed.
    pub fn disclose_gender(self) -> Self {
        self.another_disclosure(FIELD_GENDER)
    }

    /// Ask for the name to be disclosed. A request for the first or last name alone discloses
    /// only that part of the name field.
    pub fn disclose_name(self) -> Self {
        self.another_disclosure(FIELD_NAME)
    }

    fn another_disclosure(self, field: u8) -> Self {
        let mut query = self;
        query.disclosed_fields |= field;
        query
    }
}

mod test {
    use crate::query::Query;
    use crate::verify::Disclosure;
    use aztec::protocol::{address::AztecAddress, traits::{FromField, ToField}};
    use zkpassport::commitments::{
        age_commitment, bind_user_address_commitment, birthdate_commitment, disclose_commitment,
        expiry_date_commitment, issuing_country_exclusion_commitment,
        issuing_country_inclusion_commitment, nationality_exclusion_commitment,
        nationality_inclusion_commitment, sanctions_commitment,
    };

    fn subproofs<let K: u32, let D: u32>(_query: Query<K, D>) -> u32 {
        K
    }

    fn commitments_without_payloads<let K: u32, let D: u32>(query: Query<K, D>) -> [Field; K - 3] {
        query.expected_commitments(Option::none(), Option::none())
    }

    // A passport's disclosure of its document type and `field` at `index`, nothing else
    fn passport_disclosure<let N: u32>(index: u32, field: [u8; N]) -> Disclosure {
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        mask[0] = true;
        mask[1] = true;
        bytes[0] = "P".as_bytes()[0];
        bytes[1] = "<".as_bytes()[0];
        for i in 0..N {
            mask[index + i] = true;
            bytes[index + i] = field[i];
        }
        Disclosure { mask, bytes }
    }

    #[test]
    fn a_new_query_counts_the_three_subproofs_every_proof_has() {
        assert_eq(subproofs(Query::new()), 3);
    }

    #[test]
    fn each_check_adds_a_subproof_and_its_commitment() {
        let user = AztecAddress::from_field(0x1234);
        let query = Query::new()
            .age_between(18, 65)
            .birthdate_between(-86400, 86400)
            .expiry_date_between(1, 4102444800)
            .nationality_in(["FRA", "DEU"])
            .nationality_out(["ITA"])
            .issuing_country_in(["ESP"])
            .issuing_country_out(["USA"])
            .bind_user_address(user);

        assert_eq(subproofs(query), 11);
        assert_eq(
            commitments_without_payloads(query),
            [
                age_commitment(18, 65),
                birthdate_commitment(-86400, 86400),
                expiry_date_commitment(1, 4102444800),
                nationality_inclusion_commitment(["FRA", "DEU"]),
                nationality_exclusion_commitment(["ITA"]),
                issuing_country_inclusion_commitment(["ESP"]),
                issuing_country_exclusion_commitment(["USA"]),
                bind_user_address_commitment(user.to_field()),
            ],
        );
    }

    #[test]
    fn a_min_or_max_leaves_the_other_bound_open() {
        assert_eq(commitments_without_payloads(Query::new().age_min(18)), [age_commitment(18, 0)]);
        assert_eq(commitments_without_payloads(Query::new().age_max(65)), [age_commitment(0, 65)]);
        assert_eq(
            commitments_without_payloads(Query::new().birthdate_min(-86400)),
            [birthdate_commitment(-86400, 0)],
        );
        assert_eq(
            commitments_without_payloads(Query::new().birthdate_max(86400)),
            [birthdate_commitment(0, 86400)],
        );
        assert_eq(
            commitments_without_payloads(Query::new().expiry_date_min(1)),
            [expiry_date_commitment(1, 0)],
        );
        assert_eq(
            commitments_without_payloads(Query::new().expiry_date_max(4102444800)),
            [expiry_date_commitment(0, 4102444800)],
        );
    }

    #[test]
    fn disclosing_several_fields_adds_one_subproof() {
        let query = Query::new()
            .disclose_document_type()
            .disclose_issuing_country()
            .disclose_document_number()
            .disclose_nationality()
            .disclose_birthdate()
            .disclose_expiry_date()
            .disclose_gender()
            .disclose_name();

        assert_eq(subproofs(query), 4);
    }

    #[test]
    fn a_disclosure_and_sanctions_complete_the_expected_commitments() {
        let disclosure = passport_disclosure(54, "FRA".as_bytes());
        let query = Query::new().age_min(18).disclose_nationality().strict_sanctions();

        assert_eq(
            query.expected_commitments(Option::some(disclosure), Option::some(0xabc)),
            [
                age_commitment(18, 0),
                disclose_commitment(disclosure.mask, disclosure.bytes),
                sanctions_commitment(0xabc, true),
            ],
        );
    }

    #[test]
    fn sanctions_expects_a_non_strict_commitment() {
        let query = Query::new().sanctions();

        assert_eq(
            query.expected_commitments(Option::none(), Option::some(0xabc)),
            [sanctions_commitment(0xabc, false)],
        );
    }

    #[test(should_fail_with = "age requested twice")]
    fn rejects_age_asked_for_twice() {
        let _ = Query::new().age_min(18).age_max(65);
    }

    #[test(should_fail_with = "sanctions requested twice")]
    fn rejects_sanctions_asked_for_twice() {
        let _ = Query::new().sanctions().strict_sanctions();
    }

    #[test]
    fn accepts_a_disclosure_of_every_field_asked_for() {
        let disclosure = passport_disclosure(54, "FRA".as_bytes());

        Query::new().disclose_nationality().assert_disclosed(disclosure);
    }

    #[test(should_fail_with = "birthdate not disclosed")]
    fn rejects_a_disclosure_missing_a_field_asked_for() {
        let disclosure = passport_disclosure(54, "FRA".as_bytes());

        Query::new().disclose_nationality().disclose_birthdate().assert_disclosed(disclosure);
    }

    #[test(should_fail_with = "document type not disclosed")]
    fn rejects_a_nationality_without_the_document_type() {
        let mut disclosure = passport_disclosure(54, "FRA".as_bytes());
        disclosure.mask[0] = false;

        Query::new().disclose_nationality().assert_disclosed(disclosure);
    }

    #[test]
    fn accepts_a_partial_name() {
        let disclosure = passport_disclosure(13, "<<ANNA".as_bytes());

        Query::new().disclose_name().assert_disclosed(disclosure);
    }
}
